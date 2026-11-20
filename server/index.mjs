import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes, scryptSync, timingSafeEqual, createHash} from 'node:crypto';
import {mkdirSync, readFileSync, existsSync, writeFileSync} from 'node:fs';
import path from 'node:path';
mkdirSync('data/media', {recursive: true});

const db = new DatabaseSync('data/portfolio.sqlite');
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER);
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,
    name TEXT,
    email TEXT,
    message TEXT,
    is_read INTEGER DEFAULT 0,
    created TEXT
  );
`);
if (!db.prepare('PRAGMA table_info(messages)').all().some(column => column.name === 'subject')) {
  db.exec("ALTER TABLE messages ADD COLUMN subject TEXT DEFAULT 'General inquiry'");
}

const localGet = key => {
  const row = db.prepare('SELECT value FROM documents WHERE key=?').get(key);
  return row ? JSON.parse(row.value) : null;
};
const localSet = (key, value) => {
  db.prepare('INSERT OR REPLACE INTO documents VALUES (?,?)').run(key, JSON.stringify(value));
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (Boolean(supabaseUrl) !== Boolean(supabaseSecretKey)) {
  throw new Error('Set both SUPABASE_URL and SUPABASE_SECRET_KEY, or neither for local development.');
}

const supabase = supabaseUrl
  ? await import('@supabase/supabase-js').then(({createClient}) =>
      createClient(supabaseUrl, supabaseSecretKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        }
      })
    )
  : null;

async function getDocument(key) {
  if (!supabase) return localGet(key);
  const {data, error} = await supabase.from('documents').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

async function setDocument(key, value) {
  if (!supabase) return localSet(key, value);
  const {error} = await supabase.from('documents').upsert({key, value}, {onConflict: 'key'});
  if (error) throw error;
}

async function getSessionExpiry(tokenHash) {
  if (!supabase) {
    return db.prepare('SELECT expires FROM sessions WHERE token=?').get(tokenHash)?.expires ?? 0;
  }
  const {data, error} = await supabase.from('sessions').select('expires').eq('token', tokenHash).maybeSingle();
  if (error) throw error;
  return Number(data?.expires ?? 0);
}

async function createSession(tokenHash, expires) {
  if (!supabase) {
    db.prepare('INSERT INTO sessions VALUES (?,?)').run(tokenHash, expires);
    return;
  }
  const {error} = await supabase.from('sessions').insert({token: tokenHash, expires});
  if (error) throw error;
}

async function deleteSession(tokenHash) {
  if (!supabase) {
    db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash);
    return;
  }
  const {error} = await supabase.from('sessions').delete().eq('token', tokenHash);
  if (error) throw error;
}

async function listMessages() {
  if (!supabase) return db.prepare('SELECT * FROM messages ORDER BY id DESC').all();
  const {data, error} = await supabase.from('messages').select('*').order('id', {ascending: false});
  if (error) throw error;
  return data ?? [];
}

async function initializeDocuments() {
  const defaults = JSON.parse(readFileSync('server/seed.json', 'utf8'));
  let published = await getDocument('published');
  let draft = await getDocument('draft');

  if (!published) {
    published = defaults;
    await setDocument('published', published);
  }
  if (!draft) {
    draft = published;
    await setDocument('draft', draft);
  }

  for (const key of ['draft', 'published']) {
    const document = await getDocument(key);
    document.profile = {...defaults.profile, ...(document.profile ?? {})};
    if (!Array.isArray(document.experiences)) document.experiences = defaults.experiences;
    document.experiences = document.experiences.map(item => {
      const base = defaults.experiences.find(entry => entry.organization === item.organization);
      return base ? {...base, ...item} : item;
    });
    if (!Array.isArray(document.certificates)) document.certificates = [];
    const projects = Array.isArray(document.projects) ? document.projects : defaults.projects;
    document.projects = projects.map(item => {
      const base = defaults.projects.find(entry => entry.name === item.name);
      return base ? {...base, ...item} : item;
    });
    if (!Array.isArray(document.skills)) document.skills = defaults.skills;
    await setDocument(key, document);
  }
}

const pass = process.env.ADMIN_PASSWORD;
if (!pass || pass.length < 12) {
  throw new Error('Set ADMIN_PASSWORD to at least 12 characters before starting.');
}
const salt = randomBytes(16);
const digest = scryptSync(pass, salt, 64);
const attempts = new Map();
const contactLimits = new Map();

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(data));
}

await initializeDocuments();

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  try {
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) {
        return sendJson(res, 403, {error: 'مصدر الطلب غير مسموح'});
      }

      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 14500000) return sendJson(res, 413, {error: 'البيانات كبيرة جدًا'});
      }
      const body = raw ? JSON.parse(raw) : {};
      const token = (req.headers.cookie || '').split('; ').find(value => value.startsWith('session='))?.slice(8);
      const tokenHash = token ? createHash('sha256').update(token).digest('hex') : null;
      const auth = Boolean(tokenHash && (await getSessionExpiry(tokenHash)) > Date.now());

      if (url.pathname === '/api/content' && req.method === 'GET') {
        return sendJson(res, 200, await getDocument('published'));
      }

      if (url.pathname === '/api/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress;
        const attempt = attempts.get(ip) || {count: 0, start: Date.now()};
        if (Date.now() - attempt.start > 900000) {
          attempt.count = 0;
          attempt.start = Date.now();
        }
        if (attempt.count >= 8) return sendJson(res, 429, {error: 'محاولات كثيرة، حاول بعد 15 دقيقة'});
        attempt.count++;
        attempts.set(ip, attempt);

        if (typeof body.password !== 'string' || !timingSafeEqual(scryptSync(body.password, salt, 64), digest)) {
          return sendJson(res, 401, {error: 'كلمة المرور غير صحيحة'});
        }

        attempts.delete(ip);
        const sessionToken = randomBytes(32).toString('hex');
        const hash = createHash('sha256').update(sessionToken).digest('hex');
        await createSession(hash, Date.now() + 28800000);
        res.setHeader('Set-Cookie', `session=${sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
        return sendJson(res, 200, {ok: true});
      }

      if (url.pathname === '/api/contact' && req.method === 'POST') {
        const ip = req.socket.remoteAddress;
        let limit = contactLimits.get(ip);
        if (!limit || Date.now() - limit.start > 600000) limit = {count: 0, start: Date.now()};
        if (limit.count >= 5) return sendJson(res, 429, {error: 'Please try again in 10 minutes.'});
        limit.count++;
        contactLimits.set(ip, limit);

        if (
          typeof body.name !== 'string' ||
          typeof body.email !== 'string' ||
          typeof body.message !== 'string' ||
          !body.name.trim() ||
          !body.email.includes('@') ||
          body.message.length < 5 ||
          body.message.length > 5000
        ) {
          return sendJson(res, 400, {error: 'راجع بيانات الرسالة'});
        }

        const message = {
          name: body.name.slice(0, 120),
          email: body.email.slice(0, 200),
          message: body.message,
          is_read: false,
          created: new Date().toISOString(),
          subject: ['Project collaboration', 'Backend development', 'Job opportunity', 'Something else'].includes(body.subject)
            ? body.subject
            : 'General inquiry'
        };

        if (supabase) {
          const {error} = await supabase.from('messages').insert(message);
          if (error) throw error;
        } else {
          db.prepare('INSERT INTO messages(name,email,message,created,subject) VALUES (?,?,?,?,?)')
            .run(message.name, message.email, message.message, message.created, message.subject);
        }
        return sendJson(res, 201, {ok: true});
      }

      if (!auth) return sendJson(res, 401, {error: 'سجّل الدخول أولًا'});

      if (url.pathname === '/api/upload' && req.method === 'POST') {
        const kinds = {
          'image/png': {ext: 'png', ok: bytes => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))},
          'image/jpeg': {ext: 'jpg', ok: bytes => bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255},
          'image/webp': {ext: 'webp', ok: bytes => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'},
          'application/pdf': {ext: 'pdf', ok: bytes => bytes.toString('ascii', 0, 5) === '%PDF-'}
        };
        const kind = kinds[body.type];
        if (!kind || typeof body.base64 !== 'string') {
          return sendJson(res, 400, {error: 'الملفات المدعومة: PNG، JPG، WebP، PDF'});
        }

        const bytes = Buffer.from(body.base64, 'base64');
        if (bytes.length > 10 * 1024 * 1024 || !bytes.length || !kind.ok(bytes)) {
          return sendJson(res, 400, {error: 'ملف غير صالح أو أكبر من 10 ميجابايت'});
        }

        const name = randomBytes(20).toString('hex') + '.' + kind.ext;
        if (supabase) {
          const {error} = await supabase.storage.from('portfolio-media').upload(name, bytes, {
            contentType: body.type,
            cacheControl: '31536000',
            upsert: false
          });
          if (error) throw error;
          const {data} = supabase.storage.from('portfolio-media').getPublicUrl(name);
          return sendJson(res, 201, {url: data.publicUrl});
        }

        writeFileSync('data/media/' + name, bytes, {flag: 'wx'});
        return sendJson(res, 201, {url: '/media/' + name});
      }

      if (url.pathname === '/api/export' && req.method === 'GET') {
        res.setHeader('Content-Disposition', 'attachment; filename=portfolio-content-backup.json');
        return sendJson(res, 200, {
          exportedAt: new Date().toISOString(),
          published: await getDocument('published'),
          draft: await getDocument('draft'),
          messages: await listMessages()
        });
      }

      if (url.pathname === '/api/admin' && req.method === 'GET') {
        return sendJson(res, 200, {
          draft: await getDocument('draft'),
          messages: await listMessages()
        });
      }

      if (url.pathname === '/api/draft' && req.method === 'PUT') {
        if (
          !body.profile ||
          typeof body.profile !== 'object' ||
          !Array.isArray(body.projects) ||
          !Array.isArray(body.skills) ||
          body.skills.some(item => typeof item !== 'string') ||
          body.projects.some(item => !item || typeof item !== 'object') ||
          (body.experiences !== undefined && (!Array.isArray(body.experiences) || body.experiences.some(item => !item || typeof item !== 'object'))) ||
          (body.certificates !== undefined && (!Array.isArray(body.certificates) || body.certificates.some(item => !item || typeof item !== 'object')))
        ) {
          return sendJson(res, 400, {error: 'بيانات غير مكتملة'});
        }
        await setDocument('draft', body);
        return sendJson(res, 200, {ok: true});
      }

      if (url.pathname === '/api/publish' && req.method === 'POST') {
        await setDocument('published', await getDocument('draft'));
        return sendJson(res, 200, {ok: true});
      }

      if (url.pathname === '/api/read' && req.method === 'POST') {
        if (supabase) {
          const {error} = await supabase.from('messages').update({is_read: true}).eq('id', Number(body.id));
          if (error) throw error;
        } else {
          db.prepare('UPDATE messages SET is_read=1 WHERE id=?').run(Number(body.id));
        }
        return sendJson(res, 200, {ok: true});
      }

      if (url.pathname === '/api/logout' && req.method === 'POST') {
        if (tokenHash) await deleteSession(tokenHash);
        res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        return sendJson(res, 200, {ok: true});
      }

      return sendJson(res, 404, {error: 'غير موجود'});
    }

    if (url.pathname.startsWith('/media/')) {
      const name = url.pathname.slice(7);
      if (!/^[a-f0-9]{40}\.(png|jpg|webp|pdf)$/.test(name)) return sendJson(res, 404, {});
      if (existsSync('data/media/' + name)) {
        const extension = path.extname(name);
        res.writeHead(200, {
          'Content-Type': {'.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.pdf': 'application/pdf'}[extension],
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': extension === '.pdf' ? "frame-ancestors 'self'" : "default-src 'none'; sandbox",
          'Cache-Control': 'public,max-age=31536000,immutable'
        });
        return res.end(readFileSync('data/media/' + name));
      }
      if (supabase) {
        const {data} = supabase.storage.from('portfolio-media').getPublicUrl(name);
        res.writeHead(302, {Location: data.publicUrl, 'Cache-Control': 'public,max-age=3600'});
        return res.end();
      }
      return sendJson(res, 404, {});
    }

    let file = path.resolve('dist/client', '.' + decodeURIComponent(url.pathname));
    const root = path.resolve('dist/client');
    if (!file.startsWith(root + path.sep) && file !== root) return sendJson(res, 403, {});
    if (!existsSync(file) || url.pathname === '/') file = path.join(root, 'index.html');
    let bytes;
    try {
      bytes = readFileSync(file);
    } catch {
      return sendJson(res, 404, {});
    }
    const type = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg'}[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, {'Content-Type': type, 'X-Content-Type-Options': 'nosniff'});
    res.end(bytes);
  } catch (error) {
    console.error('Request failed:', error);
    if (!res.headersSent) return sendJson(res, 500, {error: 'تعذّر إكمال الطلب'});
    res.end();
  }
}).listen(Number(process.env.PORT || 4173), '0.0.0.0', () => {
  console.log(`Portfolio server ready${supabase ? ' (Supabase persistence enabled)' : ' (local SQLite mode)'}`);
});
