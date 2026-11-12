#!/usr/bin/env node
/**
 * 本地静态预览（供 Playwright webServer 与人工查看 dist 产物使用）。
 *
 * 复用 cdp-harness.mjs 的 startServer：支持 clean URL、中文 slug，并且会把
 * dist/_headers 里的 CSP / 安全头真实地作为响应头发出——因此 Playwright
 * 测到的是与托管平台一致的行为，而不是「少了一层头」的假静态服务。
 *
 * 用法：node scripts/serve.mjs [port]   （默认 4321）
 * 环境变量 SERVE_ROOT 可覆盖托管目录（默认 dist/）。
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './cdp-harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.argv[2] ?? process.env.PORT ?? 4321);
const root = resolve(process.env.SERVE_ROOT ?? resolve(ROOT, 'dist'));
const headersFile = resolve(root, '_headers');

const { base } = await startServer({ root, port, headersFile });
console.log(`[serve] ${root} → ${base}`);
console.log('[serve] 按 Ctrl+C 停止');
