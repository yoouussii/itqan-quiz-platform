// خادم يحاكي Google (token + Drive) لاختبار دالة homework-drive محلياً
import http from 'node:http';
const files = new Map(); let n = 0; const log = [];
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks);
  const u = new URL(req.url, 'http://x');
  log.push(`${req.method} ${u.pathname}`);
  if (u.pathname === '/__log') { res.end(JSON.stringify({ log, files: [...files.keys()] })); return; }
  if (u.pathname === '/token') {
    const p = new URLSearchParams(body.toString());
    if (p.get('refresh_token') !== 'good-refresh') { res.writeHead(400); res.end('{"error":"invalid_grant"}'); return; }
    res.end(JSON.stringify({ access_token: 'acc-1', expires_in: 3600 })); return;
  }
  if (req.headers.authorization !== 'Bearer acc-1') { res.writeHead(401); res.end('{}'); return; }
  if (u.pathname === '/upload/files' && req.method === 'POST') {
    const b = /boundary=(.+)$/.exec(req.headers['content-type'])[1];
    const parts = body.toString('latin1').split(`--${b}`);
    const meta = JSON.parse(parts[1].split('\r\n\r\n')[1]);
    const media = parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
    const id = `drv${++n}`; files.set(id, { meta, data: Buffer.from(media, 'latin1') });
    res.end(JSON.stringify({ id })); return;
  }
  const m = /^\/drive\/files\/(.+)$/.exec(u.pathname);
  if (m && req.method === 'GET') { const f = files.get(m[1]); if (!f) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': f.meta.mimeType }); res.end(f.data); return; }
  if (m && req.method === 'DELETE') { files.delete(m[1]); res.writeHead(204); res.end(); return; }
  res.writeHead(404); res.end();
}).listen(8899);
