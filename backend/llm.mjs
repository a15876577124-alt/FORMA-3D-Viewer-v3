// Provider-neutral public boundary. Existing WorkBuddy configuration remains supported.
import {createProvider,redactForModel} from './providers/index.mjs';
export {getCloudClient,DEFAULT_AGENT_MODEL,pickAgentModel} from './providers/workbuddy.mjs';
export async function listModels({provider,refresh=false}={}){return createProvider(provider).models({refresh});}
export async function chat({provider,model,messages,temperature=0.3,maxTokens,signal}){
  const p=createProvider(provider);let content='',finishReason=null,usage=null;
  for await(const c of p.stream({model:model||p.defaultModel,messages:redactForModel(messages),stream:true,temperature,max_tokens:maxTokens,signal})){
    content+=c.choices?.[0]?.delta?.content||'';finishReason=c.choices?.[0]?.finish_reason||finishReason;usage=c.usage||usage;
  }
  return {content,finishReason,usage,model};
}
