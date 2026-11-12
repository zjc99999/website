#!/usr/bin/env node
/**
 * 构建期静态搜索索引（M4）。零新增依赖：直接调用已安装的 pagefind Node API。
 *
 * 两种用法：
 *   1) 手动：pnpm build && pnpm search:index
 *   2) 自动：astro.config.mjs 的 atelierPagefind() 集成在 astro:build:done 里调用
 *      buildPagefindIndex()，因此 `pnpm build` 一条命令就会产出 dist/pagefind/。
 *
 * 设计要点：
 *  - forceLanguage: 'zh' —— R1 全站 zh-CN，避免中英混排被拆成两套索引；
 *  - 只对带 data-pagefind-body 的正文建索引（见 BaseLayout 的 <main>），
 *    nav/footer 不会污染每条结果；
 *  - 索引产物是纯静态文件，无服务端、无常驻进程；close() 必须调用，否则
 *    pagefind 的 service 子进程会让 Astro 构建进程不退出。
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {{ outDir?: string, verbose?: boolean }} [options]
 * @returns {Promise<{ pageCount: number, outputPath: string }>}
 */
export async function buildPagefindIndex({ outDir = resolve(ROOT, 'dist'), verbose = false } = {}) {
  const { createIndex, close } = await import('pagefind');
  let index;
  try {
    const created = await createIndex({
      forceLanguage: 'zh',
      excludeSelectors: ['[data-pagefind-ignore]', 'script', 'style'],
      verbose,
    });
    if (created.errors?.length) {
      throw new Error(`[pagefind] createIndex: ${created.errors.join('; ')}`);
    }
    index = created.index;
    if (!index) throw new Error('[pagefind] createIndex 未返回 index');

    const added = await index.addDirectory({ path: outDir, glob: '**/*.html' });
    if (added.errors?.length) {
      throw new Error(`[pagefind] addDirectory: ${added.errors.join('; ')}`);
    }

    const written = await index.writeFiles({ outputPath: resolve(outDir, 'pagefind') });
    if (written.errors?.length) {
      throw new Error(`[pagefind] writeFiles: ${written.errors.join('; ')}`);
    }

    return { pageCount: added.page_count ?? 0, outputPath: written.outputPath };
  } finally {
    if (index) {
      try { await index.deleteIndex(); } catch { /* 已随服务关闭 */ }
    }
    try { await close(); } catch { /* 忽略重复关闭 */ }
  }
}

// 直接执行：node scripts/pagefind-index.mjs
const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  buildPagefindIndex()
    .then(({ pageCount, outputPath }) => {
      console.log(`[pagefind] OK: ${pageCount} pages -> ${outputPath}`);
    })
    .catch((err) => {
      console.error(`[pagefind] FAILED: ${err.message}`);
      process.exit(1);
    });
}
