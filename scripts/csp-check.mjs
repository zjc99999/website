#!/usr/bin/env node
/**
 * M6-e：由构建产物生成严格 CSP，并验证它与产物完全吻合。
 *
 * 做法（延续「配置写上了 ≠ 真的生效」）：
 *  1. 扫 dist/**\/*.html：找出所有**可执行**内联 <script>（排除 ld+json）、
 *     外链 <script src>、<form action>、外部图片来源；
 *  2. 对每段内联脚本算 SHA-256，交给 csp-policy.mjs 生成策略字符串；
 *  3. 写出 public/_headers（Cloudflare Pages / Netlify 通用的响应头格式），
 *     让 CSP 在真实托管时作为 HTTP 响应头生效（meta http-equiv 管不到
 *     frame-ancestors 等指令，所以不放 meta）；
 *  4. 反查：策略里登记的每个哈希都能在产物里找到对应脚本，产物里每个内联
 *     脚本也都在策略中；任何不匹配即 FAIL（故意改脚本却忘更新 → CI 红）。
 *
 * 输出 public/_headers 是唯一写操作；dist/ 只读。脚本零新增依赖。
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCsp } from './csp-policy.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const HEADERS = join(ROOT, 'public', '_headers');

const walk = async (dir) => {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
};

const originOf = (raw) => {
  try {
    const u = new URL(raw, 'https://atelier.example.com');
    return u.origin === 'https://atelier.example.com' ? null : u.origin;
  } catch {
    return null;
  }
};

const htmlFiles = await walk(DIST);
const inlineBodies = [];
const scriptOrigins = new Set();
const formOrigins = new Set();
const imgOrigins = new Set();
let ldJson = 0;
let styleAttrs = 0;
let onAttrs = 0;

for (const f of htmlFiles) {
  const h = await readFile(f, 'utf8');
  for (const m of h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const attrs = m[1];
    if (/application\/ld\+json/.test(attrs)) { ldJson++; continue; }
    const src = /\bsrc=["']([^"']+)["']/.exec(attrs)?.[1];
    if (src) {
      const o = originOf(src);
      if (o) scriptOrigins.add(o);
    } else {
      inlineBodies.push({ file: relative(DIST, f), body: m[2] });
    }
  }
  for (const m of h.matchAll(/<form\b[^>]*\baction=["']([^"']+)["']/g)) {
    const o = originOf(m[1]);
    if (o) formOrigins.add(o);
  }
  for (const m of h.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/g)) {
    const o = originOf(m[1]);
    if (o) imgOrigins.add(o);
  }
  styleAttrs += (h.match(/\sstyle=/g) || []).length;
  onAttrs += (h.match(/\son[a-z]+=/g) || []).length;
}

const hashOf = (body) => `'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`;
const hashes = [...new Set(inlineBodies.map((x) => hashOf(x.body)))];
const csp = buildCsp({
  scriptHashes: hashes,
  scriptOrigins: [...scriptOrigins],
  formOrigins: [...formOrigins],
  connectOrigins: [...scriptOrigins, ...formOrigins],
  imgOrigins: [...imgOrigins],
});

// 产物里出现的所有内联脚本哈希，必须恰好等于策略里的哈希集合。
const bodyHashes = new Set(inlineBodies.map((x) => hashOf(x.body)));
const missing = [...bodyHashes].filter((h) => !hashes.includes(h));
const extra = hashes.filter((h) => !bodyHashes.has(h));

const headers = [
  '# 由 scripts/csp-check.mjs 从构建产物自动生成，请勿手工编辑。',
  '# 重新生成：pnpm build && pnpm test:csp',
  '/*',
  `  Content-Security-Policy: ${csp}`,
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
  '',
].join('\n');

// 漂移检测：只比对「已登记的内联脚本哈希集合」。
//  - 哈希是源码的纯函数：改了 search.astro 的内联脚本、或新增内联脚本却没
//    重新生成 _headers，集合就会变 → FAIL，CI 红（这正是要守的红线）。
//  - form/connect/script 的 **来源** 是部署环境变量的纯函数（M7 配第三方表单、
//    Umami 后会变），不该拿源码仓库里那份 _headers 去比，否则合法的部署配置
//    会被误判成漂移。这里刻意只锁哈希。
const hashesIn = (text) => [...new Set((text.match(/'sha256-[^']+'/g) ?? []))].sort();
let prior = null;
try { prior = await readFile(HEADERS, 'utf8'); } catch { /* 首次生成 */ }
const committedHashes = prior === null ? null : hashesIn(prior);
const drift = committedHashes !== null &&
  JSON.stringify(committedHashes) !== JSON.stringify([...hashes].sort());

await mkdir(join(ROOT, 'public'), { recursive: true });
await writeFile(HEADERS, headers, 'utf8');
// 同步一份到 dist/：下次 `pnpm build` 会把 public/_headers 复制过去，
// 但本脚本常在 build 之后运行，本地静态服务器（scripts/serve.mjs）需要立刻
// 能读到这份头，才能真实验证「CSP 被当作响应头发出来了」。
await writeFile(join(DIST, '_headers'), headers, 'utf8');
const checks = [
  ['内联脚本全部被哈希登记', missing.length === 0 && extra.length === 0, `missing=${missing.length} extra=${extra.length}`],
  ['哈希数与内联脚本段数一致', hashes.length === bodyHashes.size, `${hashes.length}/${bodyHashes.size}`],
  ['策略含 strict script-src', /script-src 'self' 'wasm-unsafe-eval'/.test(csp), 'yes'],
  ['策略含 frame-ancestors none', /frame-ancestors 'none'/.test(csp), 'yes'],
  ['产物无 style 属性', styleAttrs === 0, String(styleAttrs)],
  ['产物无事件处理器属性', onAttrs === 0, String(onAttrs)],
  ['_headers 已写出', headers.length > 200, `${headers.length}B`],
  ['已提交的 _headers 与产物一致（无漂移）', drift === false, drift ? 'DRIFT（请重新生成并提交）' : 'ok'],
];

const verdict = checks.every(([, ok]) => ok) ? 'PASS' : 'FAIL';
console.log('@@CSP@@ ' + JSON.stringify({
  verdict,
  htmlFiles: htmlFiles.length,
  inlineScripts: inlineBodies.length,
  hashes,
  ldJson,
  styleAttrs,
  onAttrs,
  externalScriptOrigins: [...scriptOrigins],
  formOrigins: [...formOrigins],
  drift,
  csp,
}));
for (const [name, ok, actual] of checks) console.log(`${ok ? '✓' : '✗'} ${name} → ${actual}`);
if (verdict !== 'PASS') process.exitCode = 1;
