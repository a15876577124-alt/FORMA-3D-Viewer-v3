// Scratch harness: dump everything the page prints while booting.
import puppeteer from 'puppeteer-core';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const b = await puppeteer.launch({
  executablePath: EDGE, headless: true,
  args: ['--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const p = await b.newPage();
p.on('console', (m) => {
  const loc = m.location();
  console.log('[console:' + m.type() + ']', m.text(), loc && loc.url ? `<- ${loc.url}:${loc.lineNumber}:${loc.columnNumber}` : '');
});
p.on('pageerror', (e) => console.log('[pageerror]', e.message, '\n  ', (e.stack || '').split('\n').slice(0, 8).join('\n   ')));
p.on('requestfinished', (r) => { const res = r.response(); if (res && res.status() >= 400) console.log('[bad]', res.status(), r.url()); });
await p.goto(process.argv[2] || 'http://127.0.0.1:5173/index.html', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
console.log('has __FORMA:', await p.evaluate(() => !!window.__FORMA));
console.log('fatal:', await p.evaluate(() => { const f = document.getElementById('fatal'); return f && !f.hidden ? document.getElementById('fatalMsg').textContent : null; }));
console.log('stage size:', await p.evaluate(() => { const c = document.getElementById('stage'); return c ? c.width + 'x' + c.height : null; }));
await b.close();
