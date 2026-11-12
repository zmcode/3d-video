// 自动化验证：本地静态服务 + WebCodecs 导出回执。
// 用法：node tools/verify.mjs [--shot s01] [--timeout 180]
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve('dist');
const PORT = Number(process.env.PORT ?? 4199);
const CHROME = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PROFILE = path.join(os.tmpdir(), `vf-chrome-${process.pid}`);

if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('[verify] 找不到 dist/index.html，请先执行 npm run build');
  process.exit(1);
}

const args = process.argv.slice(2);
const shot = args.includes('--shot') ? args[args.indexOf('--shot') + 1] : null;
const timeoutMs = Number(args.includes('--timeout') ? args[args.indexOf('--timeout') + 1] : 180) * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png'
};

let child = null;
let done = false;

function finish(payload, code) {
  if (done) return;
  done = true;
  console.log(JSON.stringify(payload));
  try {
    child?.kill();
  } catch {
    // ignore
  }
  setTimeout(() => {
    try {
      fs.rmSync(PROFILE, { recursive: true, force: true });
    } catch {
      // chrome 可能仍占用文件，留给系统清理
    }
  }, 800);
  server.close(() => process.exit(code));
  setTimeout(() => process.exit(code), 1500);
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';

  if (req.method === 'POST' && url.startsWith('/result')) {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      res.writeHead(204, { 'access-control-allow-origin': '*' });
      res.end();
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        finish({ ok: false, error: 'bad json from page' }, 1);
        return;
      }
      finish(data, data.ok ? 0 : 1);
    });
    return;
  }

  const pathname = decodeURIComponent(url.split('?')[0]);
  const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  const query = new URLSearchParams({ export: '1', post: '1' });
  if (shot) query.set('shot', shot);
  const url = `http://127.0.0.1:${PORT}/?${query.toString()}`;
  console.log(`[verify] serving ${ROOT} · opening ${url}`);

  child = spawn(
    CHROME,
    [
      '--headless=new',
      '--enable-unsafe-swiftshader',
      '--disable-extensions',
      '--mute-audio',
      '--no-first-run',
      '--window-size=1280,720',
      `--user-data-dir=${PROFILE}`,
      url
    ],
    { stdio: 'ignore' }
  );

  child.on('exit', (code) => {
    if (!done) finish({ ok: false, error: `chrome exited early with code ${code}` }, 1);
  });

  setTimeout(() => finish({ ok: false, error: `timeout after ${timeoutMs / 1000}s` }, 1), timeoutMs);
});
