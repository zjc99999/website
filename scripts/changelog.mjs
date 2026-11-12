#!/usr/bin/env node
/**
 * 发布流辅助（设计文档 5.5「每周汇总已发布 log → newsletter 草稿」）：
 * 把最近一段时间已发布的创作日志聚合成一份可读的周报草稿。
 *
 * 纯 Node，无新增依赖；frontmatter 用最小解析器（不引入 yaml 包，
 * 避免依赖 pnpm 严格隔离下不可见的间接依赖）。草稿仅供人工润色，不自动发送。
 *
 * 用法：
 *   pnpm changelog                # 最近 7 天
 *   pnpm changelog --days=30      # 最近 30 天
 *   pnpm changelog --all          # 全部已发布日志
 *
 * 输出：exports/newsletter-YYYY-MM-DD.md（exports/ 已 gitignore，草稿不入库）
 */
import { readdirSync, readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const LOG_DIR = join(ROOT, 'src', 'content', 'log');
const OUT_DIR = join(ROOT, 'exports');

function parseArgs(argv) {
  let days = 7;
  let all = false;
  for (const a of argv) {
    if (a === '--all') all = true;
    else if (a.startsWith('--days=')) days = Math.max(1, Number(a.slice(7)) || 7);
  }
  return { days, all };
}

function parseFrontmatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  if (!m) return {};
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (/^\s*(#|\/\/|-\s)/.test(line)) continue; // 注释或数组项
    const i = line.indexOf(':');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (k) data[k] = v;
  }
  return data;
}

function main() {
  const { days, all } = parseArgs(process.argv.slice(2));
  if (!statSync(LOG_DIR, { throwIfNoEntry: false })) {
    console.error('✗ 找不到 src/content/log/');
    process.exit(1);
  }

  const cutoff = all ? null : Date.now() - days * 86400_000;
  const entries = [];
  for (const name of readdirSync(LOG_DIR)) {
    if (!/\.(md|mdx)$/.test(name)) continue;
    const file = join(LOG_DIR, name);
    const d = parseFrontmatter(readFileSync(file, 'utf8'));
    if (d.status && d.status !== 'published') continue;
    if (d.visibility === 'private') continue;
    const ts = d.published_at ? Date.parse(d.published_at) : NaN;
    if (Number.isNaN(ts)) continue;
    if (cutoff !== null && ts < cutoff) continue;
    entries.push({
      date: new Date(ts).toISOString().slice(0, 10),
      kind: d.kind || 'note',
      title: d.title || name,
      summary: d.summary || '',
      path: `src/content/log/${name}`,
      ts,
    });
  }

  entries.sort((a, b) => b.ts - a.ts);

  const now = new Date();
  const stamp = now.toISOString().slice(0, 10);
  const range = all
    ? '全部已发布日志'
    : `最近 ${days} 天（${new Date(now.getTime() - days * 86400_000).toISOString().slice(0, 10)} ~ ${stamp}）`;

  let out = `# 创作周报草稿 · ${stamp}\n\n`;
  out += `> 自动聚合自 \`src/content/log/\`，范围：${range}，共 ${entries.length} 条。\n`;
  out += `> 这是草稿：请人工挑选、润色、补一句开场白后再发给订阅者。\n\n`;
  if (entries.length === 0) {
    out += `_（本区间没有已发布日志。）_\n`;
  } else {
    let lastDate = '';
    for (const e of entries) {
      if (e.date !== lastDate) {
        out += `## ${e.date}\n\n`;
        lastDate = e.date;
      }
      out += `### [${e.kind}] ${e.title}\n\n`;
      if (e.summary) out += `${e.summary}\n\n`;
      out += `- 全文：\`${e.path}\`\n\n`;
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, `newsletter-${stamp}.md`);
  writeFileSync(outFile, out, 'utf8');
  console.log(`✓ 周报草稿已生成：exports/newsletter-${stamp}.md`);
  console.log(`  范围：${range}；聚合 ${entries.length} 条已发布日志。`);
}

main();
