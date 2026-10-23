// Controlled protocol/fault tests. These are not live AI qualification evidence.
import test,{after} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {createProvider,testProvider,redactForModel} from '../backend/providers/index.mjs';
import {streamLLM} from '../backend/agent/llmStream.mjs';
let mode='ok',received;
const server=http.createServer(async(req,res)=>{
  if(mode==='stall'){req.on('close',()=>res.end());return;}
  if(/^\d+$/.test(mode)){res.writeHead(Number(mode),{'content-type':'application/json'}).end(JSON.stringify({error:{param:'tools',message:'private upstream detail'}}));return;}
  if(req.url.endsWith('/models')){res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'test-native'}]}));return;}
  const chunks=[];for await(const c of req)chunks.push(c);received=JSON.parse(Buffer.concat(chunks));
  res.setHeader('content-type','text/event-stream');
  const events=[{choices:[{delta:{content:'测试',tool_calls:[{index:0,id:'call_1',function:{name:mode==='text'?'wrong_tool':'forma_connection_test',arguments:'{"ok":'}}]}}]},
    {choices:[{delta:{tool_calls:[{index:0,function:{arguments:'true}'}}]},finish_reason:'tool_calls'}]}];
  const data=Buffer.from(events.slice(0,mode==='incomplete'?1:2).map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join('')+(mode==='incomplete'?'':'data: [DONE]\r\n\r\n'));
  for(let i=0;i<data.length;i+=7)res.write(data.subarray(i,i+7));res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const keys=['FORMA_OPENAI_BASE_URL','FORMA_OPENAI_API_KEY','FORMA_OPENAI_MODEL'],before=keys.map(k=>process.env[k]);
process.env.FORMA_OPENAI_BASE_URL=`http://127.0.0.1:${server.address().port}/v1`;
process.env.FORMA_OPENAI_API_KEY='synthetic-test-only';process.env.FORMA_OPENAI_MODEL='test-native';
after(async()=>{keys.forEach((k,i)=>before[i]===undefined?delete process.env[k]:process.env[k]=before[i]);server.closeAllConnections();await new Promise(r=>server.close(r));});
test('fragmented UTF-8 SSE preserves native tool arguments and redacts local tool results',async()=>{
  mode='ok';const result=await streamLLM({provider:'compatible',model:'test-native',messages:[{role:'tool',content:JSON.stringify({afterPath:'C:/private/model.glb',triangles:42,dataBase64:'private-bytes'})}]});
  assert.equal(result.content,'测试');assert.equal(result.toolCalls[0].arguments.ok,true);
  assert.ok(!JSON.stringify(received).includes('private'));assert.match(received.messages[0].content,/42/);
  assert.equal((await createProvider('compatible').models())[0].supportsToolCall,null);
});
test('connection test requires native tool name and valid arguments',async()=>{
  mode='ok';assert.equal((await testProvider({provider:'compatible'})).tools,true);
  mode='text';assert.equal((await testProvider({provider:'compatible'})).code,'tools_unverified');
});
test('credentials, rate limits and unsupported tools have separate sanitized errors',async()=>{
  for(const [status,code]of [['401','credentials_invalid'],['403','credentials_invalid'],['429','quota_or_rate_limit'],['400','tools_unsupported']]){
    mode=status;const r=await testProvider({provider:'compatible'});assert.equal(r.code,code);assert.ok(!JSON.stringify(r).includes('private upstream'));
  }
});
test('clean socket EOF without final event cannot succeed with a partial tool call',async()=>{
  mode='incomplete';await assert.rejects(streamLLM({provider:'compatible',model:'test-native',messages:[]}),{code:'provider_stream_incomplete'});
});
test('cancellation interrupts stalled network request',async()=>{
  mode='stall';await assert.rejects(streamLLM({provider:'compatible',model:'test-native',messages:[],signal:AbortSignal.timeout(60)}),{code:'provider_timeout'});
});
test('task configuration snapshots survive environment changes; unconfigured is distinct',async()=>{
  mode='ok';const p=createProvider('compatible'),url=process.env.FORMA_OPENAI_BASE_URL;
  delete process.env.FORMA_OPENAI_BASE_URL;
  assert.equal((await p.models())[0].id,'test-native');
  assert.notEqual(p.fingerprint,createProvider('compatible').fingerprint);
  await assert.rejects(createProvider('compatible').models(),{code:'provider_unconfigured'});
  process.env.FORMA_OPENAI_BASE_URL=url;
});
test('external HTTP endpoint is rejected before credential transmission',async()=>{
  const url=process.env.FORMA_OPENAI_BASE_URL;process.env.FORMA_OPENAI_BASE_URL='http://example.com/v1';
  await assert.rejects(createProvider('compatible').models(),{code:'provider_config_invalid'});process.env.FORMA_OPENAI_BASE_URL=url;
  assert.deepEqual(redactForModel({url:'http://private',nested:{originalPath:'/private/asset'}}),{url:'[local resource]',nested:{originalPath:'[local resource]'}});
});
