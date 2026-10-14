// FORMA 3D Viewer V3 - zero-dependency static server.
// ES modules + import maps require an http:// origin (file:// is blocked by CORS).
import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ktx2': 'image/ktx2',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mtl': 'model/mtl',
  '.obj': 'model/obj',
  '.fbx': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';

    // Block path traversal.
    const resolved = path.resolve(ROOT, '.' + pathname);
    if (!resolved.startsWith(ROOT)) {
      res.writeHead(403).end('403 Forbidden');
      return;
    }

    const stat = await fs.stat(resolved).catch(() => null);
    if (!stat || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + pathname);
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
      'Accept-Ranges': 'bytes',
    });

    if (req.method === 'HEAD') { res.end(); return; }

    // Support HTTP Range (helps large GLB resume / partial reads).
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        const start = m[1] ? Number(m[1]) : 0;
        const end = m[2] ? Number(m[2]) : stat.size - 1;
        if (start >= stat.size || end >= stat.size || start > end) {
          res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
          return;
        }
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': end - start + 1,
        });
        createReadStream(resolved, { start, end }).pipe(res);
        return;
      }
    }
    createReadStream(resolved).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 ' + err.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`FORMA 3D Viewer V3`);
  console.log(`  serving : ${ROOT}`);
  console.log(`  local   : http://${HOST}:${PORT}/`);
  console.log(`  Ctrl+C to stop`);
});
