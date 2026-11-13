#!/usr/bin/env node
/**
 * 部署冒烟检查（M7 准备）。零新增依赖，只用 Node 24 内置 fetch / fs。
 *
 * 两种模式，覆盖「部署前」与「部署后」两个时刻：
 *   1) 本地模式（默认）：`pnpm deploy:smoke`
 *      用 scripts/cdp-harness.mjs 的 startServer 托管 dist/，并把 dist/_headers
 *      里的 CSP 作为真实响应头发出。回答「这份产物一旦上传，能不能被完整消费」。
 *   2) 远端模式：`pnpm deploy:smoke https://真实域名` 或 DEPLOY_URL=...
 *      直接 fetch 线上 URL。回答「这次部署/回滚之后，线上是否仍然健康」。
 *
 * 检查项与 M4/M6 的门禁同源，但刻意是「消费端视角」：HTTP 状态、每页一个 h1、
 * canonical、RSS/JSON Feed/sitemap/Pagefind 产物、首页零可执行脚本、严格 CSP、
 * 图片 srcset、隐私/联系/订阅页可达。它不重新跑 Lighthouse/axe（那属于 quality:browser）。
 *
 * 输出：逐条 ✓/✗ + `@@SMOKE@@ {verdict,...}`；任一失败退出码 1。
 *
 * 诚实边界：远端模式只验证「公开读路径」，不验证表单外部送达、不验证 DNS/邮件
 * 记录、不验证国内可访问性——那些需要真人按 docs/部署与回滚演练.md 逐项确认。
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');

const remoteArg =
  process.env.DEPLOY_URL ||
  (process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : '');
const isRemote = Boolean(remoteArg);
const normalizeBase = (u) => u.replace(/\/+$/, '');

const checks = [];
const check = (name, ok, detail = '') => checks.push({ name, ok, detail });

/** 抓一个 URL，返回 {status, headers, text}；网络错误转成 status=0。 */
async function get(base, path) {
  const url = base + path;
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    return { status: res.status, headers: res.headers, text, url };
  } catch (e) {
    return { status: 0, headers: new Headers(), text: '', error: e.message, url };
  }
}

/** 从 CSP 字符串里单独取 script-src 指令（style-src 里允许 unsafe-inline，不能误伤）。 */
function scriptSrc(csp) {
  const d = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('script-src'));
  return d ?? '';
}

async function run(base, { expectHeaders }) {
  // 1) 核心页面 200 + 每页恰好一个 h1 + lang/canonical
  const pages = [
    '/', '/products/', '/log/', '/capabilities/', '/about/', '/now/', '/uses/',
    '/privacy/', '/contact/', '/subscribe/', '/search/',
  ];
  const pageRows = [];
  for (const p of pages) {
    const r = await get(base, p);
    const h1 = (r.text.match(/<h1\b/g) || []).length;
    const lang = /<html[^>]*\blang=/.test(r.text);
    const canonical = /rel="canonical"/.test(r.text);
    const ok = r.status === 200 && h1 === 1 && lang && canonical;
    pageRows.push({ path: p, status: r.status, h1, lang, canonical, ok });
  }
  check('核心页面 200 / 单一 h1 / lang / canonical', pageRows.every((r) => r.ok),
    pageRows.filter((r) => !r.ok).map((r) => `${r.path}(${r.status},h1=${r.h1})`).join(',') || `${pageRows.length} 页全通过`);

  // 2) 首页零可执行脚本（排除 ld+json），且有版式样式外链
  const home = await get(base, '/');
  const scripts = [...home.text.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  const exec = scripts.filter((a) => !/application\/ld\+json/.test(a));
  check('首页零可执行客户端脚本（E7）', exec.length === 0, `exec=${exec.length} ldjson=${scripts.length - exec.length}`);

  // 3) 机器可读产物：RSS / JSON Feed / sitemap / Pagefind UI / robots
  const robots = await get(base, '/robots.txt');
  check('robots.txt 指向真实域名 sitemap',
    robots.status === 200 && /Sitemap:\s*https:\/\/website\.85138175\.xyz\/sitemap-index\.xml/.test(robots.text),
    `status=${robots.status}`);

  const rss = await get(base, '/rss.xml');
  const rssOk = rss.status === 200 && /<rss\b[^>]*version="2\.0"/.test(rss.text) && /<item>/.test(rss.text);
  check('RSS 2.0 可被阅读器消费（含 item）', rssOk, `status=${rss.status} bytes=${rss.text.length}`);

  const feed = await get(base, '/feed.json');
  let feedOk = false;
  let feedItems = 0;
  try {
    const j = JSON.parse(feed.text);
    feedItems = Array.isArray(j.items) ? j.items.length : 0;
    feedOk = feed.status === 200 && j.version === 'https://jsonfeed.org/version/1.1' && feedItems > 0;
  } catch { /* 非 JSON */ }
  check('JSON Feed 1.1 可解析且有内容', feedOk, `status=${feed.status} items=${feedItems}`);

  const sitemap = await get(base, '/sitemap-index.xml');
  const sitemapOk = sitemap.status === 200 && /<sitemapindex|<urlset/.test(sitemap.text);
  check('sitemap 可被搜索引擎消费', sitemapOk, `status=${sitemap.status} bytes=${sitemap.text.length}`);

  const pf = await get(base, '/pagefind/pagefind-ui.js');
  const pfOk = pf.status === 200 && pf.text.includes('PagefindUI');
  check('Pagefind 搜索产物可加载', pfOk, `status=${pf.status} bytes=${pf.text.length}`);

  // 4) CSP：本地模式必须有真响应头且 script-src 严格；远端模式记录但不硬失败
  //    （某些托管平台会把 _headers 转成别的机制，人工按演练文档核对）。
  const csp = home.headers.get('content-security-policy') ?? '';
  const ss = scriptSrc(csp);
  const strict = ss.includes("'self'") && !ss.includes('unsafe-inline') && !ss.includes('*');
  if (expectHeaders) {
    check('CSP 作为真实响应头发出', csp.length > 0, csp ? 'present' : 'MISSING');
    check('CSP script-src 严格（无 unsafe-inline / 通配）', strict, ss || '(empty)');
  } else {
    // 远端模式：托管平台未必把 _headers 映射成响应头，只记录、不硬失败；
    // 是否生效由 docs/部署与回滚演练.md 的人工核对项负责。
    check('CSP 响应头（远端信息项，不判失败）', true,
      csp ? 'present' : '未返回，按演练文档人工核对');
  }

  // 5) 图片优化产物：至少一张带 srcset 的图
  const products = await get(base, '/products/');
  const hasSrcset = /\bsrcset=/.test(products.text);
  check('图片走 Astro 优化（存在 srcset）', hasSrcset, hasSrcset ? 'yes' : 'no');

  // 6) 关键转化/合规页可达（已在 pageRows 里，但单独给一条可读结论）
  const conv = ['/contact/', '/subscribe/', '/privacy/'].every((p) =>
    pageRows.find((r) => r.path === p)?.ok);
  check('转化与隐私页可达', conv, conv ? 'contact/subscribe/privacy 全 200' : '有页面不可达');

  return { mode: isRemote ? 'remote' : 'local', base, pageRows,
    rssBytes: rss.text.length, feedItems, sitemapBytes: sitemap.text.length,
    pfBytes: pf.text.length, cspPresent: csp.length > 0, scriptSrc: ss, hasSrcset };
}

let server;
let base;
let expectHeaders = false;
try {
  if (isRemote) {
    base = normalizeBase(remoteArg);
  } else {
    if (!existsSync(join(DIST, 'index.html'))) {
      console.error('[deploy-smoke] 本地模式需要 dist/index.html，请先 pnpm build');
      process.exit(1);
    }
    // 动态 import：startServer 会连带 import find-chrome.mjs，但它不会启动浏览器，安全。
    const { startServer } = await import('./cdp-harness.mjs');
    server = await startServer({ root: DIST, headersFile: join(DIST, '_headers') });
    base = server.base;
    expectHeaders = existsSync(join(DIST, '_headers'));
  }

  const payload = await run(base, { expectHeaders });
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? ` → ${c.detail}` : ''}`);
  }
  console.log(`@@SMOKE@@ ${JSON.stringify({ verdict: failed.length ? 'FAIL' : 'PASS',
    failed: failed.length, ...payload })}`);
  if (failed.length) process.exitCode = 1;
} catch (e) {
  console.error('[deploy-smoke] 异常：' + (e?.stack ?? e));
  process.exitCode = 1;
} finally {
  if (server) await new Promise((r) => server.server.close(r));
}
