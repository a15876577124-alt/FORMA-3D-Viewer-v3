import test,{after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import http from 'node:http';import {spawn} from 'node:child_process';
assert.equal(process.cwd(),process.env.FORMA_TEST_ISOLATED_ROOT);
const children=[];
async function start(script,env){return new Promise((resolve,reject)=>{const p=spawn(process.execPath,[script],{env:{...process.env,...env},windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(p);let text='';const timer=setTimeout(()=>reject(Error('server startup timeout')),15000);p.stdout.on('data',b=>{text+=b;const m=text.match(/http:\/\/127\.0\.0\.1:(\d+)/);if(m){clearTimeout(timer);resolve(m[0]);}});p.once('error',reject);});}
const backend=await start('backend/server.mjs',{FORMA_BACKEND_PORT:'0'}),frontend=await start('serve.mjs',{PORT:'0',FORMA_BACKEND:backend});
after(()=>{for(const p of children)p.kill();});
async function request(base,url,headers={},body,method=body?'POST':'GET'){
 return new Promise((resolve,reject)=>{const r=http.request(base+url,{headers,method},res=>{let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,text,headers:res.headers}));});r.on('error',reject);if(body)r.write(body);r.end();});
}
test('both servers reject hostile Host, Origin, null Origin and cross-site reads',async()=>{
 for(const base of [backend,frontend])for(const headers of [{Host:'attacker.invalid'},{Origin:'https://attacker.invalid'},{Origin:'null'},{'Sec-Fetch-Site':'cross-site'}])assert.equal((await request(base,'/api/assets',headers)).status,403);
});
test('cross-site mutation is rejected before importing or running tools',async()=>{
 const count=(await (await fetch(backend+'/api/assets')).json()).assets.length;
 for(const base of [backend,frontend])assert.equal((await request(base,'/api/assets/import',{'Content-Type':'application/json',Origin:'https://attacker.invalid'},'{}')).status,403);
 assert.equal((await (await fetch(backend+'/api/assets')).json()).assets.length,count);
});
test('same-origin random-port frontend can import through proxy; offline AI remains local',async()=>{
 const body=JSON.stringify({name:'security-avocado.glb',dataBase64:fs.readFileSync('test-assets/licensed/Avocado.glb').toString('base64')});
 const r=await request(frontend,'/api/assets/import',{'Content-Type':'application/json',Origin:frontend},body);
 assert.equal(r.status,200);assert.ok(JSON.parse(r.text).asset.id);
 const id=JSON.parse(r.text).asset.id;assert.equal((await request(frontend,'/api/assets/'+id+'/analyze',{},undefined,'POST')).status,200,'empty-body action remains compatible');
 const status=await request(frontend,'/api/health',{});assert.equal(status.status,200);assert.equal(status.headers['x-content-type-options'],'nosniff');
});
test('form posts and oversized declared bodies fail before allocation',async()=>{
 for(const base of [backend,frontend]){
  assert.equal((await request(base,'/api/ai/test',{'Content-Type':'text/plain'},'{}')).status,415);
  assert.equal((await request(base,'/api/ai/test',{'Content-Type':'application/json','Content-Length':9*1024*1024},undefined,'POST')).status,413);
 }
});
test('chunked uploads obey 8 MiB budget without a declared content length',async()=>{
 for(const base of [backend,frontend]){const r=await request(base,'/api/ai/test',{'Content-Type':'application/json'},Buffer.alloc(9*1024*1024,32));assert.equal(r.status,413,base+' '+r.text);}
});
