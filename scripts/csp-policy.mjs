#!/usr/bin/env node
/**
 * 纯函数：由「产物里真实存在的东西」推导出 CSP 字符串（M6-e）。
 *
 * 设计原则（延续本项目「配置写上了 ≠ 真的生效」的纪律）：
 *  - 不猜、不读 .env、不依赖部署平台；调用方从**构建后的 HTML**里扫出
 *    内联脚本哈希与外链来源，再传进来。产物是什么，策略就罩住什么。
 *  - script-src 是 XSS 的主防线：只允许 'self' + 已登记的内联脚本哈希 +
 *    产物里真实出现的外部脚本来源（如启用 Umami 时），并显式允许
 *    'wasm-unsafe-eval'（Pagefind 的搜索索引是 WASM，缺了它 /search 会挂）。
 *  - style-src 允许 'unsafe-inline'：Pagefind UI（Svelte 编译产物）在运行时
 *    注入样式；放宽 style 不会放开脚本执行，是明确的、记录在案的取舍。
 *  - form-action / connect-src 把产物里真实出现的表单端点来源加进来，
 *    否则 M5 配好第三方表单端点后会被 CSP 静默拦掉。
 *  - frame-ancestors 'none' + object-src 'none' + base-uri 'self' 收紧其余面。
 */

/**
 * @typedef {Object} CspInput
 * @property {string[]} [scriptHashes] 形如 'sha256-<base64>'，对应内联脚本
 * @property {string[]} [scriptOrigins] 产物中出现的外部 <script src> 来源
 * @property {string[]} [formOrigins] 产物中出现的 <form action> 来源
 * @property {string[]} [connectOrigins] 需要 fetch/XHR 的来源
 * @property {string[]} [imgOrigins] 产物中出现的外部图片来源
 */

const uniq = (xs) => [...new Set(xs.filter(Boolean))];
const line = (...parts) => parts.flat().filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

/**
 * @param {CspInput} input
 * @returns {string} 可直接放进响应头 / <meta> 的 CSP 值
 */
export function buildCsp(input = {}) {
  const scriptHashes = uniq(input.scriptHashes ?? []);
  const scriptOrigins = uniq(input.scriptOrigins ?? []);
  const formOrigins = uniq(input.formOrigins ?? []);
  const connectOrigins = uniq(input.connectOrigins ?? []);
  const imgOrigins = uniq(input.imgOrigins ?? []);

  const directives = [
    line("default-src 'self'"),
    line("base-uri 'self'"),
    line("object-src 'none'"),
    line("frame-ancestors 'none'"),
    line("form-action 'self'", formOrigins),
    line("script-src 'self' 'wasm-unsafe-eval'", scriptHashes, scriptOrigins),
    line("style-src 'self' 'unsafe-inline'"),
    line("img-src 'self' data:", imgOrigins),
    line("font-src 'self'"),
    line("connect-src 'self'", connectOrigins),
    line("worker-src 'self' blob:"),
    line("media-src 'self'"),
    line("manifest-src 'self'"),
  ];
  return directives.join('; ') + ';';
}
