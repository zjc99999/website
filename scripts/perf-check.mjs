#!/usr/bin/env node
/**
 * G2 性能门禁实测（M4）。零新增依赖：
 *  - Node 原生 http 起一个静态服务器托管 dist/；
 *  - Chrome headless 通过 --remote-debugging-port=0 + DevToolsActivePort 暴露 CDP；
 *  - Node 24 内置全局 WebSocket 直连 CDP，不装 puppeteer/playwright/lighthouse。
 *
 * 测量条件对齐 Lighthouse「Slow 4G」：RTT 150ms、下行 1.6Mbps、上行 750Kbps、
 * CPU 4× 降速；用 PerformanceObserver 在页面内采集 LCP / CLS / FCP / TBT。
 * 另外从 dist/index.html 统计首屏 JS 与 CSS 的 gzip 传输字节（E7 预算）。
 *
 * 用法：node scripts/perf-check.mjs
 * 输出：@@PERF@@ {...} 一行 JSON + 人可读的 PASS/FAIL 判定；退出码非 0 = 门禁不过。
 *
 * 诚实边界：本脚本不是 Lighthouse，不产出 Lighthouse 分数；它实测的是 G2 三项
 * 硬指标（LCP / CLS / 首屏 JS）及其同源指标。Lighthouse CI 固化在 M6 的 ci.yml。
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = resolve(ROOT, 'dist');
const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1) 静态服务器 ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = resolve(DIST, '.' + normalize(rel).replace(/\\/g, '/'));
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end();
      return;
    }
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

// ---------- 2) 首屏资源字节（E7 预算） ----------
async function firstScreenBytes() {
  const html = await readFile(join(DIST, 'index.html'), 'utf8');
  const scriptSrcs = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((m) => m[1]);
  // is:inline 的内联脚本（如 /search 的 Pagefind 懒加载器）虽不阻塞渲染，
  // 但字节仍要计入「首屏 JS」预算，不能只统计外链脚本。
  const inlineScripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const cssHrefs = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["']/gi)].map(
    (m) => m[1],
  );
  // 兼容 href 在 rel 之前的写法
  for (const m of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*rel=["']stylesheet["']/gi)) {
    if (!cssHrefs.includes(m[1])) cssHrefs.push(m[1]);
  }
  const sizeOf = async (u) => {
    const p = resolve(DIST, '.' + normalize(new URL(u, base).pathname).replace(/\\/g, '/'));
    const buf = await readFile(p);
    return { raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
  };
  const js = await Promise.all(scriptSrcs.map(sizeOf));
  const css = await Promise.all(cssHrefs.map(sizeOf));
  const inlineRaw = inlineScripts.reduce((a, s) => a + Buffer.byteLength(s, 'utf8'), 0);
  const inlineGzip = inlineScripts.reduce(
    (a, s) => a + gzipSync(Buffer.from(s, 'utf8'), { level: 9 }).length,
    0,
  );
  const sum = (arr, k) => arr.reduce((a, x) => a + x[k], 0);
  return {
    scriptCount: scriptSrcs.length + inlineScripts.length,
    cssCount: cssHrefs.length,
    jsRaw: sum(js, 'raw') + inlineRaw,
    jsGzip: sum(js, 'gzip') + inlineGzip,
    cssRaw: sum(css, 'raw'),
    cssGzip: sum(css, 'gzip'),
    inlineScriptCount: inlineScripts.length,
  };
}

// ---------- 3) CDP over 原生 WebSocket ----------
const userDataDir = await mkdtemp(join(tmpdir(), 'atelier-perf-'));
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--window-size=1350,940',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let ws;
let chromeReady = false;
try {
  // Chrome 把实际调试端口写进 DevToolsActivePort 第一行
  let port = 0;
  for (let i = 0; i < 100; i++) {
    try {
      const txt = await readFile(join(userDataDir, 'DevToolsActivePort'), 'utf8');
      port = Number(txt.split('\n')[0].trim());
      if (port > 0) break;
    } catch {
      /* 还没写 */
    }
    await sleep(100);
  }
  if (!port) throw new Error('Chrome 未暴露 DevToolsActivePort（检查 CHROME_PATH 与无头启动参数）');

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page') ?? targets[0];
  if (!page?.webSocketDebuggerUrl) throw new Error('CDP 未提供 page target');
  chromeReady = true;

  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('WebSocket 连接 CDP 失败'));
  });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve: r, reject: j } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) j(new Error(`${msg.error.message}`));
      else r(msg.result);
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
  // Slow 4G（Lighthouse 同款）：1.6Mbps 下行 / 750Kbps 上行 / 150ms RTT / CPU 4×
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__perf = { lcp: 0, cls: 0, fcp: 0, tbt: 0, longTasks: 0 };
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch (e) {}
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__perf.longTasks++; window.__perf.tbt += Math.max(0, e.duration - 50); } }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
    `,
  });

  await send('Page.navigate', { url: `${base}/` });
  // 等 load 完成 + 一段稳定窗口，让 LCP / CLS 观察器收齐
  for (let i = 0; i < 200; i++) {
    const ready = await evaluate('document.readyState');
    if (ready === 'complete') break;
    await sleep(50);
  }
  await sleep(1200);
  const perf = JSON.parse(await evaluate('JSON.stringify(window.__perf)'));

  const bytes = await firstScreenBytes();
  const round = (n, d = 1) => Number(n.toFixed(d));
  const result = {
    url: `${base}/`,
    throttling: 'Slow 4G (RTT 150ms / 1.6Mbps / CPU 4x)',
    lcpMs: round(perf.lcp),
    fcpMs: round(perf.fcp),
    cls: round(perf.cls, 4),
    tbtMs: round(perf.tbt),
    longTasks: perf.longTasks,
    firstScreenJsKB: round(bytes.jsGzip / 1024, 2),
    firstScreenJsRawKB: round(bytes.jsRaw / 1024, 2),
    firstScreenCssKB: round(bytes.cssGzip / 1024, 2),
    scriptCount: bytes.scriptCount,
    cssCount: bytes.cssCount,
    inlineScriptCount: bytes.inlineScriptCount,
  };
  const checks = [
    ['LCP < 1500ms', result.lcpMs < 1500, `${result.lcpMs}ms`],
    ['CLS < 0.1', result.cls < 0.1, String(result.cls)],
    ['首屏 JS ≤ 50KB (gzip, 含内联)', result.firstScreenJsKB <= 50, `${result.firstScreenJsKB}KB`],
    ['首页零可执行脚本', result.scriptCount === 0, `${result.scriptCount} 个`],
  ];
  result.checks = checks.map(([name, ok, actual]) => ({ name, ok, actual }));
  result.verdict = checks.every(([, ok]) => ok) ? 'PASS' : 'FAIL';

  console.log('@@PERF@@ ' + JSON.stringify(result));
  for (const c of result.checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name} → ${c.actual}`);
  console.log(`G2 可测硬指标：${result.verdict}`);
  console.log('注：Lighthouse 分数不在本脚本产出范围，固化在 M6 的 lighthouse CI。');
  if (result.verdict !== 'PASS') process.exitCode = 1;
} catch (err) {
  console.error(`[perf-check] FAILED: ${err.message}`);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { chrome.kill(); } catch { /* ignore */ }
  await sleep(300);
  try { await rm(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  server.close();
  if (!chromeReady) console.error('提示：可用 CHROME_PATH 指定本机 chrome.exe 路径。');
}
