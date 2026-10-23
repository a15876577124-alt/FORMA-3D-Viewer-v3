// Agent 主循环：真实 LLM 决策 + 工具调用 + 多轮回灌 + 执行日志 + 后验。
// 铁律：服务端不提供任何默认/兜底的算子填充路径——每个工具调用必须来自 LLM 产出的 tool_calls。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { streamLLM } from './llmStream.mjs';
import { toNativeTools, toPromptSpec, dispatchTool, getTool } from './tools.mjs';
import { DEFAULT_AGENT_MODEL } from '../llm.mjs';
import { assertSafeId } from '../paths.mjs';
import {createProvider} from '../providers/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export class AgentError extends Error {
  constructor(message, status = 500) { super(message); this.name = 'AgentError'; this.status = status; }
}

const SYSTEM_PROMPT = `你是 FORMA 3D 资产管线的 AI 分析代理。你可以调用工具来读取资产报告、提出处理方案、执行算子、做后验与对比。
规则：
1. 所有数据必须来自工具返回的真实报告，禁止编造顶点/三角形/贴图等数字。
2. 琼剧手办的贴图、脸谱、头饰、纹样具有高艺术价值——任何可能改变外观的算子（法线、材质、贴图缩放/压缩、减面）都必须说明理由与风险，并谨慎对待。
3. 先 analyze_asset 读取报告，再 propose_ops 提出方案，需要执行时用 run_op，最后用 finish 总结。
4. 只调用工具清单里存在的工具，不要发明工具名。`;

// 读取 spike 结果决定协议（auto 模式）。
function resolveProtocol(model) {
  const spikePath = path.join(ROOT, 'test-out', 'llm-tools-spike.json');
  if (!fs.existsSync(spikePath)) return 'native'; // 已实测 native 可用
  try {
    const arr = JSON.parse(fs.readFileSync(spikePath, 'utf8'));
    const native = arr.find((r) => r.model === model && r.mode === 'native');
    if (native?.ok) return 'native';
    const prompt = arr.find((r) => r.model === model && r.mode === 'prompt');
    if (prompt?.ok) return 'prompt';
    return 'native';
  } catch { return 'native'; }
}

function nowIso() { return new Date().toISOString(); }

// 判定死循环：连续两次派发完全相同的 (name, args)
function isRepeat(lastTwo, name, argsRaw) {
  if (lastTwo.length < 2) return false;
  const sig = `${name}|${argsRaw}`;
  return lastTwo[0] === sig && lastTwo[1] === sig;
}

export async function runAgent({
  assetId, goal, model, provider, protocol = 'native',
  maxRounds = 8, maxToolCalls = 24, wallClockMs = 180000, dryRun = true,
  onEvent = () => {}, llmFn, ctx = {}, signal, resumeRunId, confirmToken,
}) {
  assertSafeId(assetId);
  if (process.env.FORMA_LLM_OFFLINE === '1') throw new AgentError('LLM 离线（FORMA_LLM_OFFLINE=1）',503);
  const assetsDir = ctx.assetsDir || path.join(ROOT,'backend/workspace/assets');
  const runDir = path.join(assetsDir,assetId,'runs');
  fs.mkdirSync(runDir,{recursive:true});
  let previous;
  if (resumeRunId) {
    assertSafeId(resumeRunId);
    previous = JSON.parse(fs.readFileSync(path.join(runDir,resumeRunId+'.json'),'utf8'));
    if (previous.assetId !== assetId || previous.status !== 'awaiting_confirmation' || !confirmToken || confirmToken !== previous.confirmation?.token) throw new AgentError('确认与待恢复任务不匹配',409);
    ({goal,model,protocol,dryRun} = previous);
  }
  const service=createProvider(previous?.provider||provider);
  if(previous?.providerFingerprint&&previous.providerFingerprint!==service.fingerprint)throw new AgentError('待恢复任务的服务配置已改变，请创建新任务',409);
  if(previous){
    // Claim only after validating the service snapshot; invalid resumes consume nothing.
    try {fs.closeSync(fs.openSync(path.join(runDir,resumeRunId+'.resumed'),'wx'));}
    catch(e){if(e.code==='EEXIST')throw new AgentError('该任务已经恢复过，请查看最新运行记录',409);throw e;}
    ctx.setVersion?.(previous.currentVersion);
  }
  model=model||service.defaultModel||(service.id==='workbuddy'?DEFAULT_AGENT_MODEL:null);
  const proto = protocol === 'auto' ? resolveProtocol(model) : protocol;
  const llm = llmFn || streamLLM;
  const deadline = AbortSignal.timeout(Math.max(1,Math.min(Number(wallClockMs)||180000,180000)));
  const abort = signal ? AbortSignal.any([signal,deadline]) : deadline;
  const toolCtx = {...ctx, assetsDir, assetId, dryRun, signal:abort, confirmToken:previous ? confirmToken : undefined};
  const runId = 'run_'+Date.now()+'_'+crypto.randomBytes(4).toString('hex');
  const log = {runId,assetId,model,provider:service.id,providerFingerprint:service.fingerprint,protocol:proto,dryRun,goal,parentRunId:resumeRunId,
    startedAt:nowIso(),endedAt:null,totalMs:0,rounds:[],toolStats:{},finish:null,rawChunkSample:[],errors:[],status:'running'};
  const started = Date.now();
  const messages = previous?.messages || [
    {role:'system',content:SYSTEM_PROMPT + '\n当前资产 ID: '+assetId+'；起始版本: '+(ctx.getVersion?.()||0)+'。后续工具自动使用前一步通过后验的版本。可用算子及参数：'+JSON.stringify(ctx.operationSpec||[]) +(proto==='prompt'?'\n每次只输出一行 JSON {"tool":"工具名","args":{}}。\n'+toPromptSpec():'')},
    {role:'user',content:goal}];
  const lastTwoCalls=[];
  let totalToolCalls=0;
  // Only race read-only LLM waits. A running asset operator settles before cancellation returns.
  async function query(params) {
    abort.throwIfAborted();
    let listener;
    try {return await Promise.race([llm({...params,provider:service,signal:abort}),new Promise((_,reject)=>{listener=()=>reject(abort.reason);abort.addEventListener('abort',listener,{once:true});})]);}
    finally {abort.removeEventListener('abort',listener);}
  }
  try {
    for(let round=1;round<=Math.max(1,Math.min(maxRounds,16));round++) {
      abort.throwIfAborted();
      const rec={i:round,llmMs:0,usage:null,rawText:'',reasoning:'',toolCalls:[],errors:[]};
      log.rounds.push(rec);
      let calls;
      if (round===1 && previous) calls=previous.pendingCalls;
      else {
        const t=Date.now();
        const res=await query({model,messages,tools:proto==='prompt'?undefined:toNativeTools(),toolChoice:proto==='prompt'?undefined:'auto',temperature:0.2});
        Object.assign(rec,{llmMs:Date.now()-t,usage:res.usage||null,rawText:res.content||'',reasoning:res.reasoning||''});
        log.rawChunkSample.push(...(res.rawChunkSample||[]).slice(0,5));
        calls=res.toolCalls||[];
        if(proto==='prompt'&&!calls.length)calls=parsePromptToolCall(res.content||'');
        if(!calls.length){log.finish={summary:res.content||'',appliedOps:[]};break;}
        messages.push(proto==='prompt'?{role:'assistant',content:res.content||''}:{role:'assistant',content:res.content||'',tool_calls:calls.map(c=>({id:c.id,type:'function',function:{name:c.name,arguments:c.argumentsRaw||JSON.stringify(c.arguments)}}))});
      }
      for(let i=0;i<calls.length;i++) {
        abort.throwIfAborted();
        if(++totalToolCalls>Math.min(maxToolCalls,64))throw new Error('达到工具调用上限');
        const call=calls[i],t=Date.now();
        const disp=await dispatchTool(toolCtx,call.name,call.arguments);
        toolCtx.confirmToken=undefined;
        const result=disp.ok?disp.result:disp;
        const argsText=call.argumentsRaw||JSON.stringify(call.arguments);
        rec.toolCalls.push({id:call.id,name:call.name,argsText,parsed:call.arguments,ok:disp.ok,ms:Date.now()-t,resultBytes:JSON.stringify(result).length,error:disp.error||null,result});
        log.toolStats[call.name]=(log.toolStats[call.name]||0)+1;
        onEvent({type:'tool',runId,round,tool:call.name,ok:disp.ok});
        if(disp.needConfirm){log.status='awaiting_confirmation';log.confirmation={token:disp.token,reasons:disp.reasons,call};log.pendingCalls=calls.slice(i);break;}
        messages.push(proto==='prompt'?{role:'user',content:'工具 '+call.name+' 返回：'+JSON.stringify(result).slice(0,12000)}:{role:'tool',tool_call_id:call.id,content:JSON.stringify(result).slice(0,12000)});
        abort.throwIfAborted();
        if(!disp.ok && getTool(call.name)?.mutating)throw new Error('工具 '+call.name+' 失败: '+disp.error);
        if(call.name==='finish'){log.finish=disp.result;break;}
        if(isRepeat(lastTwoCalls,call.name,argsText))messages.push({role:'user',content:'检测到重复调用，请立即用 finish 总结。'});
        lastTwoCalls.push(call.name+'|'+argsText);if(lastTwoCalls.length>2)lastTwoCalls.shift();
      }
      if(log.finish||log.status==='awaiting_confirmation')break;
    }
    if(log.status==='running') {log.status=log.finish?'complete':'failed';if(!log.finish)log.errors.push('达到轮数上限');}
  } catch(e) {
    log.status=abort.aborted?(deadline.aborted?'timeout':'cancelled'):'failed';
    log.errors.push(e.message||String(e));
  }
  log.currentVersion=ctx.getVersion?.()||0;
  log.messages=messages;
  log.endedAt=nowIso();log.totalMs=Date.now()-started;
  log.logPath=path.join(runDir,runId+'.json');
  fs.writeFileSync(log.logPath,JSON.stringify(log,null,2),{flag:'wx'});
  return log;
}

function parsePromptToolCall(text) {
  // Nested parameter objects are valid; parse complete JSON, including fenced JSON.
  try {
    const value=JSON.parse(text.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
    return value.tool?[{id:'prompt_'+Date.now(),name:value.tool,arguments:value.args||value.arguments||{}}]:[];
  } catch{return [];}
}
