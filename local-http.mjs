// Loopback trust boundary shared by the local frontend and asset backend.
export const JSON_LIMIT=8*1024*1024;
export const ASSET_BODY_LIMIT=Math.ceil(256*1024*1024/3)*4+1024*1024;
export function bodyLimit(url='') {return /^\/api\/assets\/(?:import(?:\?|$)|[^/]+\/prepare-glb(?:\?|$))/.test(url)?ASSET_BODY_LIMIT:JSON_LIMIT;}
export function assertLocalRequest(req,{extraOrigins=[]}={}) {
  const port=req.socket.localPort;
  const hosts=new Set(['127.0.0.1','localhost','[::1]'].map(h=>h+':'+port));
  if(!hosts.has(req.headers.host))throw Object.assign(new Error('仅接受本机服务地址'),{status:403,name:'host_rejected'});
  const allowed=new Set([...hosts].map(h=>'http://'+h).concat(extraOrigins));
  if((req.headers.origin&&!allowed.has(req.headers.origin))||(!req.headers.origin&&req.headers['sec-fetch-site']==='cross-site'))throw Object.assign(new Error('请求来源不受信任'),{status:403,name:'origin_rejected'});
  const hasBody=Number(req.headers['content-length']||0)>0||!!req.headers['transfer-encoding'];
  if(req.method==='POST'&&(hasBody||req.headers['content-type'])&&!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))throw Object.assign(new Error('API 请求必须使用 application/json'),{status:415,name:'content_type_rejected'});
  const length=Number(req.headers['content-length']||0);
  if(length>bodyLimit(req.url))throw Object.assign(new Error('请求体超过大小上限'),{status:413,name:'body_limit'});
}
