// Deterministic fault injection, never presented as live LLM evidence.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {importAsset} from '../backend/importAsset.mjs';
import {runAgent} from '../backend/agent/agent.mjs';
import {makeAgentCtx,runAssetPipeline} from '../backend/runPipeline.mjs';
import {dispatchTool} from '../backend/agent/tools.mjs';
assert.equal(process.cwd(),process.env.FORMA_TEST_ISOLATED_ROOT);
const bytes=fs.readFileSync('test-assets/licensed/Avocado.glb');
const assetId=importAsset('agent-avocado.glb',bytes).id;
const call=(name,args)=>({id:crypto.randomUUID(),name,arguments:args});
const finish=call('finish',{summary:'test finished'});
const fake=(...rounds)=>async()=>({toolCalls:rounds.shift()||[finish]});
test('real operators chain and export explicit version; confirmation resumes exact call once',async()=>{
  const ctx=makeAgentCtx();
  const first=await runAgent({assetId,goal:'test',dryRun:false,ctx,llmFn:fake([
    call('run_op',{assetId,op:'weld',params:{epsilon:0.000001}}),
    call('run_op',{assetId,op:'dedup'}),
    call('export_asset',{assetId,to:'gltf'})])});
  assert.equal(first.status,'awaiting_confirmation');
  const [one,two]=first.rounds[0].toolCalls.map(c=>c.result);
  assert.equal(two.beforePath,one.afterPath);assert.equal(two.baseVersion,one.version);
  assert.equal(first.currentVersion,two.version);
  const second=await runAgent({assetId,resumeRunId:first.runId,confirmToken:first.confirmation.token,ctx:makeAgentCtx(),llmFn:fake([finish])});
  assert.equal(second.status,'complete');assert.equal(second.parentRunId,first.runId);
  const output=second.rounds[0].toolCalls[0].result;
  assert.equal(output.baseVersion,two.version);assert.equal(output.verify.pass,true);
  await assert.rejects(runAgent({assetId,resumeRunId:first.runId,confirmToken:first.confirmation.token,ctx:makeAgentCtx(),llmFn:fake([finish])}),/已经恢复/);
  const wrong=await runAssetPipeline({assetId,baseVersion:one.version,ops:[{op:'convert',params:{to:'gltf'}}],confirmToken:first.confirmation.token}).catch(e=>e);
  assert.equal(wrong.needConfirm,true,'confirmation cannot move to another version');
});
test('timeout, network failure and cancellation persist honest terminal states',async()=>{
  const timeout=await runAgent({assetId,goal:'test',wallClockMs:40,ctx:makeAgentCtx(),llmFn:()=>new Promise(()=>{})});
  assert.equal(timeout.status,'timeout');assert.ok(timeout.totalMs<1000);
  const failed=await runAgent({assetId,goal:'test',ctx:makeAgentCtx(),llmFn:async()=>{throw Error('network disconnected');}});
  assert.equal(failed.status,'failed');assert.match(failed.errors[0],/network disconnected/);
  const controller=new AbortController();setTimeout(()=>controller.abort(Error('cancel')),20);
  const cancelled=await runAgent({assetId,goal:'test',signal:controller.signal,ctx:makeAgentCtx(),llmFn:()=>new Promise(()=>{})});
  assert.equal(cancelled.status,'cancelled');
});
test('dryRun, wrong asset and failed verification cannot mutate or advance',async()=>{
  const before=fs.readdirSync('pipeline-out');let invoked=0;
  const log=await runAgent({assetId,goal:'test',dryRun:true,ctx:{...makeAgentCtx(),runOp:()=>{invoked++;}},llmFn:fake([call('run_op',{assetId,op:'weld'})],[finish])});
  assert.equal(invoked,0);assert.equal(log.status,'complete');assert.deepEqual(fs.readdirSync('pipeline-out'),before);
  assert.equal((await dispatchTool({assetId,runOp:()=>{invoked++;}},'run_op',{assetId:'some-other-id',op:'weld'})).ok,false);
  const context=makeAgentCtx();await assert.rejects(context.runOp({assetId,op:'unknown'}));assert.equal(context.getVersion(),0);
});
test('concurrent agent tasks reserve distinct output directories',async()=>{
  const logs=await Promise.all([1,2].map(()=>runAgent({assetId,goal:'test',dryRun:false,ctx:makeAgentCtx(),llmFn:fake([call('run_op',{assetId,op:'dedup'})],[finish])})));
  assert.ok(logs.every(l=>l.status==='complete'));assert.notEqual(logs[0].currentVersion,logs[1].currentVersion);
  assert.deepEqual(fs.readFileSync(path.join('backend/workspace',importAsset('agent-avocado.glb',bytes).originalRelPath)),bytes);
});
