import {DatabaseSync} from 'node:sqlite';
import {readdirSync, readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {createClient} from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in your local environment before running this script.');
}
if (!existsSync('data/portfolio.sqlite')) {
  throw new Error('Could not find data/portfolio.sqlite. Run this script from the project root.');
}

const supabase = createClient(url, key, {
  auth: {autoRefreshToken: false, persistSession: false, detectSessionInUrl: false}
});
const db = new DatabaseSync('data/portfolio.sqlite');
const bucket = 'portfolio-media';

function localDocument(name) {
  const row = db.prepare('SELECT value FROM documents WHERE key=?').get(name);
  return row ? JSON.parse(row.value) : null;
}

const mimeTypes = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf'
};

const publicUrls = new Map();
const mediaDirectory = 'data/media';
if (existsSync(mediaDirectory)) {
  const files = readdirSync(mediaDirectory);
  for (const file of files) {
    if (!/^[a-f0-9]{40}\.(png|jpg|webp|pdf)$/.test(file)) {
      console.log(`Skipping unrecognized media filename: ${file}`);
      continue;
    }
    const extension = path.extname(file);
    const bytes = readFileSync(path.join(mediaDirectory, file));
    const {error} = await supabase.storage.from(bucket).upload(file, bytes, {
      contentType: mimeTypes[extension],
      cacheControl: '31536000',
      upsert: true
    });
    if (error) throw new Error(`Upload failed for ${file}: ${error.message}`);
    const {data} = supabase.storage.from(bucket).getPublicUrl(file);
    publicUrls.set(file, data.publicUrl);
    console.log(`Uploaded ${file}`);
  }
}

function replaceMediaUrls(value) {
  if (typeof value === 'string') {
    return value.replace(/\/media\/([a-f0-9]{40}\.(?:png|jpg|webp|pdf))/g, (match, filename) => {
      return publicUrls.get(filename) || match;
    });
  }
  if (Array.isArray(value)) return value.map(replaceMediaUrls);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceMediaUrls(item)]));
  }
  return value;
}

for (const documentKey of ['draft', 'published']) {
  const document = localDocument(documentKey);
  if (!document) throw new Error(`Local SQLite database is missing the "${documentKey}" document.`);
  const migrated = replaceMediaUrls(document);
  const {error} = await supabase.from('documents').upsert(
    {key: documentKey, value: migrated},
    {onConflict: 'key'}
  );
  if (error) throw new Error(`Could not migrate ${documentKey}: ${error.message}`);
  console.log(`Migrated ${documentKey} document`);
}

const localMessages = db.prepare('SELECT * FROM messages ORDER BY id ASC').all();
if (localMessages.length) {
  const {data: existingMessages, error: checkError} = await supabase.from('messages').select('id').limit(1);
  if (checkError) throw checkError;
  if (existingMessages?.length) {
    console.log('Supabase already contains messages; skipped importing local messages to avoid duplicates.');
  } else {
    const rows = localMessages.map(message => ({
      name: message.name,
      email: message.email,
      message: message.message,
      is_read: Boolean(message.is_read),
      created: message.created,
      subject: message.subject || 'General inquiry'
    }));
    const {error} = await supabase.from('messages').insert(rows);
    if (error) throw new Error(`Could not migrate messages: ${error.message}`);
    console.log(`Migrated ${rows.length} messages`);
  }
} else {
  console.log('No local messages to migrate.');
}

console.log('\nMigration completed.');
console.log('Admin sessions were intentionally not migrated. Sign in again after deployment.');
console.log('Your original SQLite database and data/media files were not modified.');
db.close();
