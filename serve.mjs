// Zero-dependency local server for modules and model assets.
import { createServer, request as httpRequest } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transform } from 'node:stream';
import {assertLocalRequest,bodyLimit} from './local-http.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '127.0.0.1';
const BACKEND = process.env.FORMA_BACKEND || 'http://127.0.0.1:8787';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mtl': 'model/mtl', '.obj': 'model/obj', '.fbx': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    assertLocalRequest(req);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400).end('400 Bad Request'); return; }
    if (pathname.includes('\0')) { res.writeHead(400).end('400 Bad Request'); return; }

    // 反向代理 /api/* 到后端（127.0.0.1:8787）——前端用同源相对路径，消灭 CORS 与随机端口问题。
    if (pathname.startsWith('/api/')) {
      proxyToBackend(req, res, BACKEND);
      return;
    }

    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return;
    }
    if (pathname === '/') pathname = '/index.html';
    const resolved = path.resolve(ROOT, '.' + pathname);
    const relative = path.relative(ROOT, resolved);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      res.writeHead(403).end('403 Forbidden'); return;
    }
    const parts = relative.split(path.sep);
    if (parts.some((p) => p.startsWith('.')) || ['backend', 'node_modules', 'pipeline-out', 'test-out'].includes(parts[0].toLowerCase())) {
      res.writeHead(403).end('403 Forbidden'); return;
    }
    const real = await fs.realpath(resolved).catch(() => null);
    if (real) {
      const realRelative = path.relative(ROOT, real);
      const realParts = realRelative.split(path.sep);
      if (realRelative === '..' || realRelative.startsWith('..' + path.sep) || path.isAbsolute(realRelative) || realParts.some((p) => p.startsWith('.')) || ['backend', 'node_modules', 'pipeline-out', 'test-out'].includes(realParts[0].toLowerCase())) { res.writeHead(403).end('403 Forbidden'); return; }
    }
    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat || !stat.isFile()) { res.writeHead(404).end('404 Not Found'); return; }
    const headers = {
      'Content-Type': MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size, 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes',
    };
    let status = 200, start = 0, end = stat.size - 1;
    if (req.method === 'GET' && req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      let valid = !!match && (match[1] !== '' || match[2] !== '') && stat.size > 0;
      if (valid) {
        if (match[1] === '') {
          const count = Number(match[2]); valid = Number.isSafeInteger(count) && count > 0;
          start = Math.max(0, stat.size - count);
        } else {
          start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : end;
          valid = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end && start < stat.size;
        }
      }
      if (!valid) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end(); return; }
      status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      headers['Content-Length'] = end - start + 1;
    }
    // Choose the final status before writing headers. Writing 200 then 206 crashes Node.
    res.writeHead(status, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = createReadStream(resolved, status === 206 ? { start, end } : undefined);
    stream.on('error', (error) => res.destroy(error));
    stream.pipe(res);
  } catch (error) {
    if (res.headersSent) res.destroy(error);
    else res.writeHead(error.status||500,{'Content-Type':'application/json','Connection':'close'}).end(JSON.stringify({error:{code:error.name,message:error.status?error.message:'Internal Server Error'}}));
  }
});
server.requestTimeout=30000;server.headersTimeout=15000;
server.listen(PORT, HOST, () => {
  console.log(`FORMA 3D Viewer V3\n  serving : ${ROOT}\n  local   : http://${HOST}:${server.address().port}/\n  api     : /api/* -> ${BACKEND}\n  Ctrl+C to stop`);
});

// 反向代理：把 /api/* 请求转发到后端，透传 method/headers/body，后端不可达返回 502。
function proxyToBackend(req, res, target) {
  const destination=new URL(target);
  if(destination.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(destination.hostname)){res.writeHead(502).end('Invalid local backend');return;}
  // Allowlist headers. Origin was validated above and is now translated to the backend origin.
  const headers={host:destination.host,origin:destination.origin};
  for(const key of ['content-type','content-length','range','accept'])if(req.headers[key])headers[key]=req.headers[key];
  let failed=false,size=0;
  const upstream = httpRequest(target + req.url, {
      method: req.method,
      headers,
    }, (upRes) => {
      if(failed){upRes.destroy();return;}
      res.writeHead(upRes.statusCode || 502, upRes.headers);
      upRes.on('error',()=>res.destroy());
      upRes.pipe(res);
    });
    upstream.setTimeout(210000, () => { upstream.destroy(); });
    upstream.on('error', () => {
      if(failed)return;
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: '后端服务不可用，请先运行 npm run pipeline:serve', code: 'backend_unavailable' } }));
      } else {
        res.destroy();
      }
    });
  const budget=new Transform({transform(chunk,encoding,next){
    size+=chunk.length;
    if(size>bodyLimit(req.url)){next(Object.assign(new Error('请求体超过大小上限'),{status:413}));return;}
    next(null,chunk);
  }});
  budget.on('error',e=>{failed=true;req.unpipe(budget);req.resume();upstream.destroy();if(!res.headersSent)res.writeHead(e.status||400,{'Content-Type':'application/json','Connection':'close'}).end(JSON.stringify({error:{code:'body_limit',message:e.message}}));});
  req.on('aborted',()=>{failed=true;upstream.destroy();budget.destroy();});
  req.on('error',()=>{failed=true;upstream.destroy();if(!res.headersSent)res.writeHead(400).end();});
  res.on('close',()=>{if(!res.writableEnded)upstream.destroy();});
  req.pipe(budget).pipe(upstream);
}
