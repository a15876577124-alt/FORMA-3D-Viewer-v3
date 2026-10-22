// Zero-dependency local server for modules and model assets.
import { createServer, request as httpRequest } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    else res.writeHead(500).end('500 Internal Server Error');
  }
});
server.listen(PORT, HOST, () => {
  console.log(`FORMA 3D Viewer V3\n  serving : ${ROOT}\n  local   : http://${HOST}:${server.address().port}/\n  api     : /api/* -> ${BACKEND}\n  Ctrl+C to stop`);
});

// 反向代理：把 /api/* 请求转发到后端，透传 method/headers/body，后端不可达返回 502。
function proxyToBackend(req, res, target) {
  let body = Buffer.alloc(0);
  req.on('data', (c) => { body = Buffer.concat([body, c]); });
  req.on('end', () => {
    const upstream = httpRequest(target + req.url, {
      method: req.method,
      headers: {
        ...req.headers,
        host: new URL(target).host,
        'content-length': body.length,
      },
    }, (upRes) => {
      res.writeHead(upRes.statusCode || 502, upRes.headers);
      upRes.pipe(res);
    });
    upstream.setTimeout(60000, () => { upstream.destroy(); });
    upstream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: '后端服务不可用，请先运行 npm run pipeline:serve', code: 'backend_unavailable' } }));
      } else {
        res.destroy();
      }
    });
    if (body.length) upstream.write(body);
    upstream.end();
  });
  req.on('error', () => { if (!res.headersSent) res.writeHead(400).end(); });
}
