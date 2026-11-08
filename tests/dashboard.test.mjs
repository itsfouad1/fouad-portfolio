import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,cp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {once} from 'node:events';

test('owner editing, uploads, publication, inbox and persistence',async()=>{
 const root=process.cwd(),dir=await mkdtemp(path.join(tmpdir(),'fouad-dashboard-'));
 await cp(path.join(root,'server'),path.join(dir,'server'),{recursive:true});
 const password=randomBytes(20).toString('hex'),port=4183;
 let child,cookie='';
 const start=async()=>{child=spawn(process.execPath,['server/index.mjs'],{cwd:dir,env:{...process.env,ADMIN_PASSWORD:password,PORT:String(port)},stdio:['ignore','pipe','pipe']});await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Server did not start')})]);};
 const stop=async()=>{child.kill();await once(child,'exit')};
 const req=async(route,method='GET',body,origin)=>{const res=await fetch(`http://127.0.0.1:${port}${route}`,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});if(res.headers.get('set-cookie'))cookie=res.headers.get('set-cookie').split(';')[0];return res};
 try{
  await start();
  assert.equal((await req('/api/admin')).status,401);
  assert.equal((await req('/api/upload','POST',{})).status,401);
  assert.equal((await req('/api/login','POST',{password:'wrong'})).status,401);
  assert.equal((await req('/api/login','POST',{password},'https://unrelated.example')).status,403);
  assert.equal((await req('/api/login','POST',{password})).status,200);
  const published=await (await req('/api/content')).json();
  const d=(await (await req('/api/admin')).json()).draft;
  assert.equal((await req('/api/draft','PUT',{...d,skills:[{}]})).status,400);
  const png=await readFile(path.join(root,'public/fouad-approved.png'));
  const image=await (await req('/api/upload','POST',{type:'image/png',base64:png.toString('base64')})).json();
  assert.deepEqual(Buffer.from(await (await req(image.url)).arrayBuffer()),png);
  assert.equal((await req('/api/upload','POST',{type:'image/png',base64:Buffer.from('bad').toString('base64')})).status,400);
  assert.equal((await req('/api/upload','POST',{type:'text/html',base64:'PGgxPg=='})).status,400);
  const cv=await (await req('/api/upload','POST',{type:'application/pdf',base64:Buffer.from('%PDF-1.4\n%%EOF').toString('base64')})).json();
  assert.match(cv.url,/\.pdf$/);
  d.profile.headline='Persisted draft headline';d.profile.cv=cv.url;d.certificates=[{title:'Example',issuer:'Test',url:cv.url}];d.experiences=[{organization:'Test',role:'Developer',description:'Test'}];
  assert.equal((await req('/api/draft','PUT',d)).status,200);
  assert.equal((await (await req('/api/content')).json()).profile.headline,published.profile.headline);
  await stop();await start();
  assert.equal((await (await req('/api/admin')).json()).draft.profile.headline,d.profile.headline);
  assert.equal((await req('/api/publish','POST',{})).status,200);
  assert.equal((await (await req('/api/content')).json()).certificates.length,1);
  assert.equal((await req('/api/contact','POST',{name:'Tester',email:'test@example.com',message:'A test message',subject:'Job opportunity'})).status,201);
  const messages=(await (await req('/api/admin')).json()).messages;
  assert.equal(messages.length,1);assert.equal(messages[0].subject,'Job opportunity');await req('/api/read','POST',{id:messages[0].id});
  assert.equal((await (await req('/api/admin')).json()).messages[0].is_read,1);
  assert.equal((await (await req('/api/export')).json()).draft.profile.cv,cv.url);
  await req('/api/logout','POST',{});assert.equal((await req('/api/admin')).status,401);
 }finally{if(child&&child.exitCode===null)await stop();await rm(dir,{recursive:true,force:true})}
});
