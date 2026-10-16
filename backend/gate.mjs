// 确认门：对命中红线的算子签发一次性 HMAC token（10 分钟有效），防绕过。
import crypto from 'node:crypto';

// 进程级密钥（本地单进程服务，重启后旧 token 失效——可接受，且不落盘、不入日志）
const SECRET = crypto.randomBytes(32).toString('hex');
const TTL_MS = 10 * 60 * 1000;

export function generateConfirmToken(assetId, ops) {
  const payload = JSON.stringify({ assetId, ops, ts: Date.now() });
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifyConfirmToken(token, assetId, ops) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [payloadB64, sig] = token.split('.');
  let payload;
  try { payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')); }
  catch { return false; }
  const expect = crypto.createHmac('sha256', SECRET).update(JSON.stringify(payload)).digest('hex');
  if (sig !== expect) return false;
  if (Date.now() - payload.ts > TTL_MS) return false;
  // 校验 token 与本次请求的 assetId + ops 一致
  if (payload.assetId !== assetId) return false;
  const a = JSON.stringify(payload.ops.map((o) => ({ op: o.op, params: o.params || {} })));
  const b = JSON.stringify(ops.map((o) => ({ op: o.op, params: o.params || {} })));
  return a === b;
}
