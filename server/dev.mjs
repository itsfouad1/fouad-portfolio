import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const password=process.env.ADMIN_PASSWORD||randomBytes(24).toString('hex');
if(!process.env.ADMIN_PASSWORD){writeFileSync('.preview-admin-password',password,{mode:0o600});console.log('Temporary development password written to .preview-admin-password. Use ADMIN_PASSWORD for your own password.');}
const api=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:'4174',ADMIN_PASSWORD:password},stdio:'inherit'});
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js',...process.argv.slice(2)],{stdio:'inherit'});
const stop=()=>{api.kill();vite.kill()};process.on('SIGINT',stop);process.on('SIGTERM',stop);vite.on('exit',code=>{stop();process.exit(code||0)});api.on('exit',code=>{if(code){stop();process.exit(code)}});
