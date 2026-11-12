import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { buildPagefindIndex } from './scripts/pagefind-index.mjs';

/**
 * 本地集成：构建完成后生成 Pagefind 静态索引（M4）。
 *
 * 为什么不改 package.json 的 build 脚本：
 *   scripts/verify-hard-rules.mjs 的 runBuild() 直接执行 `node .../astro.mjs build`，
 *   若把 build 改成 `astro build && node ...`，E4 违规探针期间也会跑索引（既慢又被
 *   故意写坏的内容污染）。用 astro:build:done 钩子，pnpm build 一条命令原子产出
 *   dist/pagefind/，且 E4 测试里故意失败的构建根本不会走到这个钩子。
 *
 * 为什么传 outDir：astro.config.mjs 会被 esbuild 打包成临时文件，pagefind-index.mjs
 * 内的 import.meta.url 可能不再指向项目根；直接用钩子给的 dir（dist 的 file: URL）
 * 最可靠。钩子签名已核验 astro/dist/types/public/integrations.d.ts:384。
 */
function atelierPagefind() {
  return {
    name: 'atelier-pagefind',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        try {
          const { pageCount, outputPath } = await buildPagefindIndex({ outDir });
          logger.info(`[pagefind] 已索引 ${pageCount} 个页面 → ${outputPath}`);
        } catch (err) {
          // 索引失败不阻断静态站产出（读路径仍完整可用，符合关键不变量）；
          // 但要在 CI 里显眼地失败：抛错让 astro build 退出码非 0。
          logger.error(`[pagefind] 构建索引失败：${err.message}`);
          throw err;
        }
      },
    },
  };
}

// site 为占位：M7 换成真实自定义域名（驱动 canonical / sitemap / OG / RSS / JSON Feed）
// 见 docs/项目设计与实现规划书.md 第 11 章「待提供 ⑤」
export default defineConfig({
  site: 'https://atelier.example.com',
  integrations: [
    mdx(),
    // /search 页在 Seo.astro 里标了 noindex（站内搜索结果页无需被搜索引擎收录），
    // 两处必须一致，否则 sitemap 会自相矛盾。filter 选项已核验
    // @astrojs/sitemap@3.7.4/dist/index.d.ts:9。
    sitemap({ filter: (page) => !page.endsWith('/search/') }),
    atelierPagefind(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  // Astro 7 把 compressHTML 默认值从 true 改为 'jsx'，会吞掉行内元素间空格；
  // 本项目中文文案与行内链接较多，显式恢复 HTML 语义压缩（规划书 EX-2）。
  compressHTML: true,
});
