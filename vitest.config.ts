/**
 * Vitest 配置（M6）。
 *
 * 关键点：constants.ts / evidence.ts 直接 import 'astro:content'（Astro 的虚拟模块），
 * 在纯 Node 测试环境里无法解析。这里用 alias 把它指向 tests/stubs/astro-content.ts，
 * 让「纯逻辑」可被单测覆盖，而不必起一个完整的 Astro 构建。
 * 真实构建期的行为由 pnpm test:rules（E4-a/b/c）与 pnpm build 覆盖，两者互补。
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      'astro:content': fileURLToPath(new URL('./tests/stubs/astro-content.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // 不扫 node_modules / dist，避免把第三方 *.test.js 收进来
    exclude: ['**/node_modules/**', '**/dist/**', '**/.m*-probe/**'],
  },
});
