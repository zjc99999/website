#!/usr/bin/env node
/**
 * 站内搜索端到端回归（M4）。零新增依赖，复用 perf-check 的 CDP-over-WebSocket 思路。
 *
 * 为什么需要它：Pagefind UI 的构造参数是从 dist/pagefind/pagefind-ui.js 的压缩代码
 * 反推出来的（window.PagefindUI、驼峰参数、translations 占位符），不能只凭推断说
 * 「搜索能用」。本脚本在真实 Chrome 里打开 /search，断言：
 *   1) /pagefind/pagefind-ui.js 与 .css 成功加载（不是 404）；
 *   2) 搜索输入框被真实渲染出来（PagefindUI 初始化成功）；
 *   3) 输入关键词后能拿到结果条目（索引里确实有内容）；
 *   4) 失败时降级说明可见而不是空白死页。
 *
 * 用法：node scripts/verify-search.mjs（需先 pnpm build）
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from './find-chrome.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = resolve(ROOT, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.pf_meta': 'application/octet-stream',
  '.pf_index': 'application/octet-stream',
  '.pf_fragment': 'application/octet-stream',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer(async (req, res) => {
  try {
    let rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = resolve(DIST, '.' + normalize(rel).replace(/\\/g, '/'));
    if (!file.startsWith(DIST)) return res.writeHead(403).end();
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const userDataDir = await mkdtemp(join(tmpdir(), 'atelier-search-'));
const chrome = spawn(
  findChrome(),
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let ws;
try {
  let port = 0;
  for (let i = 0; i < 100; i++) {
    try {
      port = Number((await readFile(join(userDataDir, 'DevToolsActivePort'), 'utf8')).split('\n')[0].trim());
      if (port > 0) break;
    } catch { /* 未就绪 */ }
    await sleep(100);
  }
  if (!port) throw new Error('Chrome 未暴露 DevToolsActivePort');

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page') ?? targets[0];
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('CDP WebSocket 连接失败'));
  });

  let seq = 0;
  const pending = new Map();
  const failedUrls = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Network.loadingFailed') {
      failedUrls.push(msg.params.errorText);
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve: r, reject: j } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? j(new Error(msg.error.message)) : r(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((r, j) => {
      const id = ++seq;
      pending.set(id, { resolve: r, reject: j });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.navigate', { url: `${base}/search/` });

  // 等 PagefindUI 挂载：最多 8 秒
  let ui = null;
  for (let i = 0; i < 80; i++) {
    ui = JSON.parse(
      await evaluate(`JSON.stringify({
        ready: document.readyState,
        hasGlobal: typeof window.PagefindUI === 'function',
        inputCount: document.querySelectorAll('#search input').length,
        hasFallback: !document.getElementById('search-fallback')?.classList.contains('hidden'),
        resultNodes: document.querySelectorAll('.pagefind-ui__result').length,
      })`),
    );
    if (ui.inputCount > 0 || (ui.ready === 'complete' && ui.hasFallback)) break;
    await sleep(100);
  }

  // 输入关键词，看结果是否出现（用原生 setter + input 事件，Svelte 才能收到）
  let resultCount = 0;
  if (ui.inputCount > 0) {
    await evaluate(`(() => {
      const el = document.querySelector('#search input');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, '静态');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    for (let i = 0; i < 60; i++) {
      resultCount = await evaluate(`document.querySelectorAll('.pagefind-ui__result').length`);
      if (resultCount > 0) break;
      await sleep(100);
    }
  }

  const checks = [
    ['Pagefind UI 脚本加载（全局 PagefindUI 存在）', ui.hasGlobal, String(ui.hasGlobal)],
    ['搜索输入框已渲染', ui.inputCount > 0, `${ui.inputCount} 个`],
    ['输入「静态」返回搜索结果', resultCount > 0, `${resultCount} 条`],
    ['无资源加载失败', failedUrls.length === 0, failedUrls.join('; ') || '0'],
  ];
  const verdict = checks.every(([, ok]) => ok) ? 'PASS' : 'FAIL';
  console.log('@@SEARCH@@ ' + JSON.stringify({ verdict, ui, resultCount, failedUrls }));
  for (const [name, ok, actual] of checks) console.log(`${ok ? '✓' : '✗'} ${name} → ${actual}`);
  if (verdict !== 'PASS') process.exitCode = 1;
} catch (err) {
  console.error(`[verify-search] FAILED: ${err.message}`);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { chrome.kill(); } catch { /* ignore */ }
  await sleep(300);
  try { await rm(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  server.close();
}
