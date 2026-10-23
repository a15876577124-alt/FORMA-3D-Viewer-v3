import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
// Browser tests must own random-port processes in their disposable snapshot.
export async function startTestServers(){
 assert.equal(process.cwd(),process.env.FORMA_TEST_ISOLATED_ROOT);
 const children=[];process.on('exit',()=>{for(const p of children)p.kill();});
 async function start(script,env){return new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,[script],{env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(p);
  let log='';const timer=setTimeout(()=>reject(Error('Test server startup timeout')),15000);
  p.stdout.on('data',b=>{log+=b;const m=log.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve({child:p,url:m[0]});}});
  p.once('error',e=>{clearTimeout(timer);reject(e);});p.once('exit',()=>{clearTimeout(timer);reject(Error('Test server exited before ready'));});
 });}
 const backend=await start('backend/server.mjs',{FORMA_BACKEND_PORT:'0'}),frontend=await start('serve.mjs',{PORT:'0',HOST:'127.0.0.1',FORMA_BACKEND:backend.url});
 return {be:backend.child,serve:frontend.child,BASE:frontend.url,backendURL:backend.url};
}
