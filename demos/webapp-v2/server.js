/** Zero-dependency static demo server. Only public web assets are served. */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
function createServer(root = __dirname) {
  root = fs.realpathSync(root);
  return http.createServer(async (req, res) => {
    const finish = (status, text) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : text);
    };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-cache');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, HEAD');
      return finish(405, 'Method not allowed');
    }
    let pathname;
    try { pathname = decodeURIComponent(req.url.split('?')[0]); }
    catch { return finish(400, 'Invalid URL encoding'); }
    if (!pathname.startsWith('/') || /[\\\0]/.test(pathname) || pathname.split('/').some(p => p.startsWith('.'))) return finish(403, 'Access denied');
    if (pathname === '/') pathname = '/index.html';
    if (!path.extname(pathname)) pathname += '.html';
    if (!/^\/[\w-]+\.html$/.test(pathname) && !/^\/(css|js|img)\/[\w./-]+$/.test(pathname) && !/^\/favicon\.(ico|svg)$/.test(pathname)) return finish(404, 'Not found');
    let target = path.resolve(root, '.' + pathname);
    const ext = path.extname(target).toLowerCase();
    if (!MIME[ext]) return finish(404, 'Not found');
    try {
      const realTarget = await fs.promises.realpath(target);
      if (realTarget !== target) return finish(403, 'Access denied');
      target = realTarget;
      const relative = path.relative(root, target);
      if (relative.startsWith('..') || path.isAbsolute(relative)) return finish(403, 'Access denied');
      const stat = await fs.promises.stat(target);
      if (!stat.isFile()) return finish(404, 'Not found');
      res.writeHead(200, { 'Content-Type': MIME[ext], 'Content-Length': stat.size });
      if (req.method === 'HEAD') return res.end();
      const stream = fs.createReadStream(target);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      finish(error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500, 'File unavailable');
    }
  });
}
if (require.main === module) {
  const portIndex = process.argv.indexOf('--port');
  const port = Number(process.env.PORT || (portIndex !== -1 && process.argv[portIndex + 1]) || 8080);
  const server = createServer();
  server.on('error', error => { console.error('Could not start Cerium:', error.message); process.exitCode = 1; });
  server.listen(port, '0.0.0.0', () => console.log(`Cerium demo: http://localhost:${port}/app.html`));
}
module.exports = { createServer };
