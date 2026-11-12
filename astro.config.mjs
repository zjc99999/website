import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// site 为占位：M7 换成真实自定义域名（驱动 canonical / sitemap / OG）
// 见 docs/项目设计与实现规划书.md 第 11 章「待提供 ⑤」
export default defineConfig({
  site: 'https://atelier.example.com',
  integrations: [mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  // Astro 7 把 compressHTML 默认值从 true 改为 'jsx'，会吞掉行内元素间空格；
  // 本项目中文文案与行内链接较多，显式恢复 HTML 语义压缩（规划书 EX-2）。
  compressHTML: true,
});
