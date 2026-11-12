#!/usr/bin/env node
/**
 * 零依赖 CDP / 静态服务 / 探针构建工具箱（M5）。
 *
 * 被 verify-lead.mjs 与 verify-no-dynamic.mjs 共用；与 verify-search.mjs、
 * perf-check.mjs 同思路：Node http 托管静态产物 + Chrome headless
 * `--remote-debugging-port=0` + Node 24 内置全局 WebSocket 直连 CDP。
 *
 * 为什么要单独抽出来：M5 的两条 DoD 都需要在「带真实第三方配置」的探针构建上
 * 跑浏览器，而这两个脚本都要起服务、起 Chrome、连 CDP，重复四遍容易写出细微差异。
 * 不改动已有的 verify-search / perf-check（它们工作正常，避免回归风险）。
 */
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const ASTRO_CLI = resolve(ROOT, 'node_modules', 'astro', 'bin', 'astro.mjs');
export const NODE = process.execPath;
export const CHROME =
  process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.pf_meta': 'application/octet-stream',
  '.pf_index': 'application/octet-stream',
  '.pf_fragment': 'application/octet-stream',
};

/**
 * 起一个本地静态服务器。state.root 可在构建完成后替换（先拿端口、再换产物目录），
 * 这样表单端点 URL 能在构建期就写死成同一个 origin，避免用固定端口。
 * onPost(reqLike) 可选：收到任意 POST 时调用并返回一页「已收到」。
 */
export async function startServer({ root, onPost } = {}) {
  const state = { root: resolve(root ?? ROOT) };
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'POST' && onPost) {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = Buffer.concat(chunks).toString('utf8');
        onPost({ url: req.url, headers: req.headers, body });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>已收到</title><p>谢谢，已收到。</p></html>',
        );
        return;
      }
      let rel;
      try {
        rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      } catch {
        // Chromium 提交表单/打开链接时会把非 ASCII 路径按 raw bytes 发送，
        // decodeURIComponent 抛 URIError；退回原始 pathname 仍能命中磁盘上的中文文件名。
        rel = new URL(req.url, 'http://localhost').pathname;
      }
      if (rel.endsWith('/')) rel += 'index.html';
      let file = resolve(state.root, '.' + normalize(rel).replace(/\\/g, '/'));
      if (!file.startsWith(state.root)) return res.writeHead(403).end();
      // 模拟真实静态托管（CF Pages / Vercel / Netlify）的 clean URL：
      // 无扩展名的路径映射到 <path>/index.html。产品/日志详情链接不带尾斜杠，
      // 真机上由托管平台 301 到带斜杠，这里直接返回同一个文件（等价效果）。
      if (!extname(file)) {
        try {
          const asFile = await readFile(file);
          res.writeHead(200, {
            'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
            'Cache-Control': 'no-store',
          });
          return res.end(asFile);
        } catch {
          file = resolve(file, 'index.html');
        }
      }
      const data = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, state, base: `http://127.0.0.1:${server.address().port}` };
}

/**
 * 用一组 PUBLIC_ 环境变量把站点构建到隔离的 outDir（不污染 dist/）。
 * 默认把五个公开变量全部清空，避免继承父进程的环境造成「半配置」假象。
 * 直接调 Astro CLI，不依赖包管理器（沿用 verify-hard-rules.mjs 的结论）。
 */
export function buildProbe({ outDir, env = {}, echo = false }) {
  const merged = {
    ...process.env,
    ASTRO_TELEMETRY_DISABLED: '1',
    PUBLIC_FORM_ENDPOINT: '',
    PUBLIC_CONTACT_EMAIL: '',
    PUBLIC_CAL_URL: '',
    PUBLIC_UMAMI_SCRIPT_URL: '',
    PUBLIC_UMAMI_WEBSITE_ID: '',
    ...env,
  };
  const r = spawnSync(NODE, [ASTRO_CLI, 'build', '--outDir', outDir], {
    cwd: ROOT,
    env: merged,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 180000,
  });
  const stdout = r.stdout ?? '';
  const stderr = r.stderr ?? '';
  if (echo) console.log((stdout + stderr).slice(-2000));
  return {
    ok: r.status === 0,
    status: r.status,
    output: stdout + stderr,
    error: r.error?.message ?? '',
  };
}

/** 起一个 headless Chrome 并连上 CDP，返回 send/evaluate/on/close。 */
export async function launchChrome() {
  const userDataDir = await mkdtemp(join(tmpdir(), 'atelier-cdp-'));
  const chrome = spawn(
    CHROME,
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

  let port = 0;
  for (let i = 0; i < 100; i++) {
    try {
      port = Number(
        (await readFile(join(userDataDir, 'DevToolsActivePort'), 'utf8')).split('\n')[0].trim(),
      );
      if (port > 0) break;
    } catch {
      /* 尚未就绪 */
    }
    await sleep(100);
  }
  if (!port) {
    chrome.kill();
    throw new Error('Chrome 未暴露 DevToolsActivePort');
  }

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === 'page') ?? targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('CDP WebSocket 连接失败'));
  });

  let seq = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    for (const fn of listeners) {
      try {
        fn(msg);
      } catch (e) {
        console.error(`[cdp listener] ${e.message}`);
      }
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
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      throw new Error(
        r.exceptionDetails.text + (r.exceptionDetails.exception?.description ?? ''),
      );
    }
    return r.result.value;
  };
  const on = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };
  const close = async () => {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    try {
      chrome.kill();
    } catch {
      /* ignore */
    }
    await sleep(300);
    try {
      await rm(userDataDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  return { send, evaluate, on, close, chrome };
}

/** 导航并等待 document.readyState === 'complete' 且 URL 已切换。 */
export async function navigate(send, evaluate, url, timeoutMs = 12000) {
  await send('Page.navigate', { url });
  await sleep(150);
  // location.href 会把中文 slug 百分号编码，而传入的 url 是原始 Unicode；
  // 两边都解码后再比较，否则中文详情页永远等不到「URL 匹配」而误报超时。
  const norm = (u) => {
    let s = u;
    try {
      s = decodeURIComponent(s);
    } catch {
      /* 保留原值 */
    }
    return s.replace(/\/+$/, '');
  };
  const target = norm(url);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = await evaluate(
      `(() => ({ href: location.href, ready: document.readyState }))()`,
    ).catch(() => null);
    if (info && info.ready === 'complete' && norm(info.href) === target) return true;
    await sleep(100);
  }
  return false;
}

/** 统一的检查结果输出：逐条 ✓/✗，verdict 非 PASS 时置 process.exitCode = 1。 */
export function report(tag, payload, checks) {
  const verdict = checks.every(([, ok]) => ok) ? 'PASS' : 'FAIL';
  console.log(`@@${tag}@@ ` + JSON.stringify({ verdict, ...payload }));
  for (const [name, ok, actual] of checks) {
    console.log(`${ok ? '✓' : '✗'} ${name} → ${actual}`);
  }
  if (verdict !== 'PASS') process.exitCode = 1;
  return verdict;
}

export async function removeProbe(dir) {
  try {
    await rm(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
