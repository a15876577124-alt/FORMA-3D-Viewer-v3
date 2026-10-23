import crypto from 'node:crypto';
import {getCloudClient,listModels as workbuddyModels,loadDotEnv,cloudConfig,cloudFingerprint} from './workbuddy.mjs';
import {createToolAccumulator,accumulateToolDelta,finalizeToolCalls} from '../agent/toolAccumulator.mjs';
loadDotEnv();

export class ProviderError extends Error{
  constructor(code,message,status=502){super(message);this.name=code;this.code=code;this.status=status;}
}
export function providerError(error){
  if(error instanceof ProviderError)return error;
  const status=Number(error?.status||error?.statusCode||error?.response?.status);
  if([401,403].includes(status))return new ProviderError('credentials_invalid','模型服务凭据无效或无访问权限',502);
  if(status===429)return new ProviderError('quota_or_rate_limit','模型服务额度不足或请求频率受限',429);
  if(error?.name==='TimeoutError'||error?.name==='AbortError')return new ProviderError('provider_timeout','模型服务超时或请求已取消',504);
  return new ProviderError('provider_unreachable','模型服务不可达或返回了无效响应',502);
}
const timeout=signal=>signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000);

export function providerSummaries(){
  const cfg=cloudConfig();
  return {defaultProvider:process.env.FORMA_AI_PROVIDER||'workbuddy',providers:[
    {id:'workbuddy',label:'WorkBuddy Cloud',configured:!!(cfg.endpoint&&cfg.publishableKey),defaultModel:'deepseek-v4-pro',qualification:'既有服务；连接测试确认当前可用性'},
    {id:'compatible',label:'OpenAI-compatible',configured:!!(process.env.FORMA_OPENAI_BASE_URL&&process.env.FORMA_OPENAI_API_KEY),defaultModel:process.env.FORMA_OPENAI_MODEL||null,qualification:'工具能力须实际连接测试；密钥仅从服务端环境读取'},
  ]};
}

// Snapshot configuration per task. No client supplied endpoint/key; changes affect new tasks only.
export function createProvider(id=process.env.FORMA_AI_PROVIDER||'workbuddy'){
  if(!['workbuddy','compatible'].includes(id))throw new ProviderError('provider_unknown','未知模型服务',400);
  if(id==='workbuddy'){
    const config=cloudConfig();
    function client(){if(!config.endpoint||!config.publishableKey)throw new ProviderError('provider_unconfigured','WorkBuddy 服务未配置',503);return getCloudClient(config);}
    return Object.freeze({id,fingerprint:cloudFingerprint(config),defaultModel:'deepseek-v4-pro',
      async models({refresh=false}={}){let timer;try{client();return await Promise.race([workbuddyModels({refresh,config}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new ProviderError('provider_timeout','模型列表获取超时',504)),15000);timer.unref();})]);}catch(e){throw providerError(e);}finally{clearTimeout(timer);}},
      async *stream(params){try{yield* client().llm.chat.completions.create(params);}catch(e){throw providerError(e);}},
    });
  }
  const endpoint=process.env.FORMA_OPENAI_BASE_URL||'',key=process.env.FORMA_OPENAI_API_KEY||'',defaultModel=process.env.FORMA_OPENAI_MODEL||null;
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify([endpoint,key,defaultModel])).digest('hex').slice(0,16);
  async function request(route,body,signal){
    if(!endpoint||!key)throw new ProviderError('provider_unconfigured','兼容服务未配置：请在服务端设置 BASE_URL 和 API_KEY',503);
    let url;try{url=new URL(endpoint);}catch{throw new ProviderError('provider_config_invalid','模型服务地址配置无效',503);}
    if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new ProviderError('provider_config_invalid','外部模型服务必须使用 HTTPS；本机可使用 HTTP',503);
    try{
      const r=await fetch(endpoint.replace(/\/$/,'')+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:timeout(signal),redirect:'error'});
      if(!r.ok){
        if([401,403,429].includes(r.status))throw providerError({status:r.status});
        if(r.status===400){const e=await r.json().catch(()=>({}));if(/tool/i.test(String(e.error?.param||e.error?.code||'')))throw new ProviderError('tools_unsupported','该模型或服务不支持所请求的工具调用',422);}
        throw new ProviderError('provider_response_error','模型服务返回错误 HTTP '+r.status,502);
      }
      return r;
    }catch(e){throw providerError(e);}
  }
  return Object.freeze({id,fingerprint,defaultModel,
    async models(){try{const r=await request('/models');const data=await r.json();if(!Array.isArray(data.data))throw new Error('Invalid model list');return data.data.filter(m=>typeof m.id==='string').map(m=>({id:m.id,name:m.id,supportsToolCall:null}));}catch(e){throw providerError(e);}},
    async *stream(params){
      if(!params.model)throw new ProviderError('model_missing','请选择模型或设置 FORMA_OPENAI_MODEL',422);
      const {signal,...body}=params,r=await request('/chat/completions',body,signal);
      const decoder=new TextDecoder();let pending='',total=0,finished=false;
      try{
        for await(const chunk of r.body){
          total+=chunk.length;if(total>4*1024*1024)throw new ProviderError('provider_response_limit','模型响应超过 4 MiB 限制',502);
          pending+=decoder.decode(chunk,{stream:true}).replace(/\r/g,'');
          let end;while((end=pending.indexOf('\n\n'))>=0){
            const event=pending.slice(0,end);pending=pending.slice(end+2);
            const data=event.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
            if(!data)continue;if(data==='[DONE]')return;
            const value=JSON.parse(data);if(value.error)throw new ProviderError('provider_response_error','模型流返回错误',502);if(value.choices?.some(c=>c.finish_reason))finished=true;yield value;
          }
        }
        if(pending.trim()||!finished)throw new ProviderError('provider_stream_incomplete','模型流中断，未收到完整结束事件',502);
      }catch(e){throw providerError(e);}
    },
  });
}

export async function testProvider({provider,model}={}){
  const p=createProvider(provider),started=Date.now();
  try{
    const models=await p.models(),chosen=model||p.defaultModel||models[0]?.id;
    if(!chosen)throw new ProviderError('model_missing','服务没有可选模型',422);
    const calls=createToolAccumulator();
    for await(const c of p.stream({model:chosen,messages:[{role:'user',content:'Call forma_connection_test with ok=true. Synthetic connectivity check; no user data.'}],tools:[{type:'function',function:{name:'forma_connection_test',description:'Synthetic connection test',parameters:{type:'object',properties:{ok:{type:'boolean'}},required:['ok']}}}],tool_choice:{type:'function',function:{name:'forma_connection_test'}},stream:true,max_tokens:128,signal:AbortSignal.timeout(20000)})){
      const delta=c.choices?.[0]?.delta;if(delta?.tool_calls)accumulateToolDelta(calls,delta);
    }
    if(!finalizeToolCalls(calls).some(c=>c.name==='forma_connection_test'&&c.arguments?.ok===true))throw new ProviderError('tools_unverified','连接成功，但未收到有效的原生工具调用',422);
    return {provider:p.id,model:chosen,connected:true,tools:true,ms:Date.now()-started};
  }catch(e){const error=providerError(e);return {provider:p.id,connected:false,tools:false,code:error.code,message:error.message,ms:Date.now()-started};}
}

// Send statistics/tool arguments only. Local filesystem paths and embedded bytes never go to providers.
export function redactForModel(value){
  if(Array.isArray(value))return value.map(redactForModel);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/path|uri|url|dataBase64|contentBase64/i.test(k)?'[local resource]':redactForModel(v)]));
  if(typeof value==='string'){
    if(/^[\[{]/.test(value.trim())){try{return JSON.stringify(redactForModel(JSON.parse(value)));}catch{}}
    return value.replace(/[A-Za-z]:[\\/][^\s"']+/g,'[local path]').replace(/data:[^\s"']+;base64,[A-Za-z0-9+/=]+/g,'[embedded data]');
  }
  return value;
}
