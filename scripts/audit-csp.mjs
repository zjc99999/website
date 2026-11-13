#!/usr/bin/env node
/**
 * 构建期 CSP 可行性审计（M6-e）。
 *
 * 站点默认零客户端 JS；唯一允许的可执行脚本是 /search 页的 Pagefind 懒加载器
 * （内联 <script is:inline>）。要写一份「能真正生效」的严格 CSP，必须先量清楚
 * 产物里到底有什么：内联脚本数、外链脚本、ld+json、style 属性、事件处理器属性、
 * 内联 <style>、图片与表单、外链域名。
 *
 * 这是只读审计，不修改任何文件；输出 JSON，供 scripts/csp-check.mjs 与文档引用。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
// 与 astro.config.mjs 的 site 保持同源（M7 真实域名）；用于把首方绝对 URL 排除在 externalOrigins 之外。
const SELF_ORIGIN = new URL(process.env.PUBLIC_SITE_URL || 'https://website.85138175.xyz').origin;
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) files.push(p);
  }
})(DIST);

const inlineScripts = [];
let externalScripts = 0;
let ldJson = 0;
let styleAttrs = 0;
let onAttrs = 0;
let inlineStyles = 0;
let images = 0;
let forms = 0;
const origins = new Set();

for (const f of files) {
  const h = readFileSync(f, 'utf8');
  for (const m of h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/application\/ld\+json/.test(m[1])) ldJson++;
    else if (/\bsrc=/.test(m[1])) externalScripts++;
    else inlineScripts.push({ file: relative(DIST, f), len: m[2].length, head: m[2].trim().slice(0, 140) });
  }
  styleAttrs += (h.match(/\sstyle=/g) || []).length;
  onAttrs += (h.match(/\son[a-z]+=/g) || []).length;
  inlineStyles += (h.match(/<style\b/g) || []).length;
  images += (h.match(/<img\b/g) || []).length;
  forms += (h.match(/<form\b/g) || []).length;
  for (const m of h.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    try { origins.add(new URL(m[1], SELF_ORIGIN).origin); } catch { /* 相对链接 */ }
  }
}

console.log(JSON.stringify({
  htmlFiles: files.length,
  inlineScripts,
  externalScripts,
  ldJson,
  styleAttrs,
  onAttrs,
  inlineStyles,
  images,
  forms,
  externalOrigins: [...origins].filter((o) => o !== SELF_ORIGIN),
}, null, 2));
