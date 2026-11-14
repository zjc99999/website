#!/usr/bin/env node
/**
 * 2 分钟写入流：生成一个「作品」(products 集合) 的 .mdx 骨架。
 *
 * 用法：
 *   pnpm new:product "焕名"                         # 终端里交互补全
 *   pnpm new:product "焕名" --stage=live --featured --slug=huanming --summary="一句话"
 *   pnpm new:product "标题" < /dev/null             # 非交互，用默认值
 *
 * 与 new-log.mjs 同纪律（规划书 E11：从敲命令到可 git push 的文件 ≤2 分钟）：
 *  - 零依赖，纯 Node；双模式：process.stdin.isTTY 为真才交互，否则（管道 / CI /
 *    重定向）直接取命令行参数与默认值，绝不因 readline 收不到 EOF 而空转退出。
 *  - 生成的 frontmatter 严格对齐 src/content.config.ts 的 products schema，
 *    由真实 astro build 的 Zod 校验兜底，脚本不另写一套「看起来对」的校验。
 *  - ★ 可选字段没值就整行省略（写 `url:` 空值会被 YAML 解析成 null 让 build 失败）。
 *  - 用户文本一律用 JSON.stringify 输出成合法 YAML 双引号标量，
 *    因此标题里有冒号 / 引号 / 换行也不会破坏 frontmatter。
 *
 * 本模块导出纯函数（slugify / nextOrder / buildProductMdx），便于加回归测试；
 * 被 import 时不执行任何副作用（import.meta.main 为 false），路径计算放在 main 里。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const STAGES = ['idea', 'building', 'live', 'archived'];
const STAGE_HINTS = { idea: '想法中', building: '开发中', live: '已上线', archived: '已归档' };
const STATUSES = ['draft', 'published'];
const VISIBILITIES = ['public', 'unlisted', 'private'];
const LOCALES = ['zh-CN', 'en'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** 与 new-log.mjs 同款：保留中文与小写英文数字，其余压成连字符 */
export const slugify = (s) =>
  String(s)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\-\u4e00-\u9fa5]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'untitled';

/** 合法 YAML 双引号标量（JSON 字符串是 YAML 双引号标量的子集） */
const q = (v) => JSON.stringify(String(v));

const parseBool = (v, fallback = false) => {
  if (v === undefined || v === null || v === '') return fallback;
  if (v === true || v === 'true' || v === '1' || v === 'yes' || v === 'y') return true;
  if (v === false || v === 'false' || v === '0' || v === 'no' || v === 'n') return false;
  throw new Error(`布尔值只能是 true/false，收到：${v}`);
};

/** 从已有作品文件内容里算出下一个 order（新建的排最后） */
export function nextOrder(contents) {
  let max = 0;
  for (const c of contents) {
    for (const m of String(c).matchAll(/^order:\s*(\d+)\s*$/gm)) {
      max = Math.max(max, Number(m[1]));
    }
  }
  return max + 1;
}

/** 插值进 MDX 块注释前，去掉唯一能提前闭合注释的序列（防御病态标题） */
const commentSafe = (s) => String(s).replace(/\*\//g, '* /');

/**
 * 正文骨架：三段式 + 一段说明可选字段的注释（不渲染进页面）。
 *
 * ★ 这里必须用 MDX 注释 `{/* ... *\/}`，不能用 HTML 注释 `<!-- -->`：
 *   本工具产出 .mdx（与 src/content/products/atelier.mdx 一致），而 MDX 会把
 *   `<!--` 当成非法字符直接让 astro build 失败（实测错误：
 *   mdx-jsx:unexpected-character "Unexpected character `!` ... to create a
 *   comment in MDX, use {/* text *\/}"）。new-log.mjs 产出 .md 才可用 HTML 注释。
 *   这是「跑真实 build 探针」才抓到、单测看不出来的坑，故在单测里也锁住。
 */
function body(slug, title) {
  const safeSlug = commentSafe(slug);
  const safeTitle = commentSafe(title);
  return `## 这是什么

{/* 一句话说清它是什么、给谁用；写好前别 push */}

## 为什么做

{/* 当时要解决什么问题 */}

## 设计上的取舍

{/* 做了什么、放弃了什么；与「以过程建立信任」的调性一致 */}

{/*
可选字段（补到上面的 frontmatter；没值就整行删掉，别写空值）：
  url: https://example.com            产品外链 → 卡片/详情页「访问站点 ↗」
  repo_url: https://github.com/...    源码 → 「源码 ↗」
  launch_date: YYYY-MM-DD             详情页「… 上线」
  cover: ../../assets/xxx.png         图片放 src/assets/，构建期自动出 WebP + srcset
  metrics:                            卡片最多展示前 3 条
    用户数: 1200
    平台: Windows
  updated_at: YYYY-MM-DD
  seo:
    title: 自定义搜索标题
    description: 自定义描述
    og: https://example.com/og.png

关联创作记录：在 src/content/log/ 某条日志的 frontmatter 写 product_id: ${safeSlug}，
本作品详情页底部就会自动列出「这个作品的创作记录」。

发布：git add . && git commit -m "content: 添加作品 ${safeTitle}" && git push origin main
*/}
`;
}

/** 纯函数：按已校验的 opts 生成完整 .mdx 文本 */
export function buildProductMdx(o) {
  const lines = [
    `title: ${q(o.title)}`,
    `summary: ${q(o.summary)}`,
    `tagline: ${q(o.tagline)}`,
    `stage: ${o.stage}`,
    `featured: ${o.featured}`,
    `order: ${o.order}`,
    `published_at: ${o.published_at}`,
    `status: ${o.status}`,
    `visibility: ${o.visibility}`,
    `tags: ${JSON.stringify(o.tags)}`,
    `locale: ${o.locale}`,
  ];
  // 可选字段：有值才写，绝不写空值
  if (o.url) lines.push(`url: ${q(o.url)}`);
  if (o.repo_url) lines.push(`repo_url: ${q(o.repo_url)}`);
  if (o.launch_date) lines.push(`launch_date: ${o.launch_date}`);
  if (o.cover) lines.push(`cover: ${q(o.cover)}`);
  if (o.updated_at) lines.push(`updated_at: ${o.updated_at}`);
  return `---\n${lines.join('\n')}\n---\n\n${body(o.slug, o.title)}`;
}

/** 解析命令行：所有 --key=value 进 flags，其余位置词拼成标题 */
function parseArgs(argv) {
  const flags = {};
  const words = [];
  for (const a of argv) {
    if (a === '--featured') flags.featured = 'true';
    else if (a.startsWith('--') && a.includes('=')) {
      const i = a.indexOf('=');
      flags[a.slice(2, i).replace(/-/g, '_')] = a.slice(i + 1);
    } else if (a.startsWith('--')) {
      throw new Error(`未知参数 ${a}（用法：--key=value）`);
    } else words.push(a);
  }
  return { positionalTitle: words.join(' ').trim(), flags };
}

async function ask(rl, question) {
  return new Promise((res) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        res(v);
      }
    };
    rl.question(question, (a) => done(a.trim()));
    rl.once('close', () => done('')); // stdin 提前关闭也能收尾
  });
}

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function main() {
  const ROOT = resolve(import.meta.dirname, '..');
  const PRODUCTS_DIR = join(ROOT, 'src', 'content', 'products');

  const { positionalTitle, flags } = parseArgs(process.argv.slice(2));
  const interactive = Boolean(process.stdin.isTTY);

  let title = flags.title || positionalTitle;
  let tagline = flags.tagline;
  let summary = flags.summary;
  let stage = flags.stage;
  let slug = flags.slug;
  let featured = flags.featured;

  let rl;
  if (interactive) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
    if (!title) title = await ask(rl, '标题（一句话）：');
    if (!tagline) tagline = (await ask(rl, 'tagline（卡片上那一句）：')) || title;
    if (!summary) summary = (await ask(rl, '摘要（可回车用 tagline）：')) || tagline;
    if (!stage) {
      console.log('\n阶段：');
      STAGES.forEach((s, i) => console.log(`  ${i + 1}) ${s.padEnd(9)} ${STAGE_HINTS[s]}`));
      const picked = await ask(rl, '选阶段 [1-4，默认 2=building；已完成的项目选 3]：');
      const idx = Number(picked) - 1;
      stage = Number.isInteger(idx) && idx >= 0 && idx < STAGES.length ? STAGES[idx] : 'building';
    }
    if (featured === undefined) {
      featured = (await ask(rl, '进首页「精选作品 ≤3」？[y/N]：')) || 'false';
    }
    if (!slug) slug = await ask(rl, 'URL 短名（回车用标题生成，建议用英文短名）：');
    rl.close();
  } else if (!title) {
    die('非交互模式必须提供标题：pnpm new:product "标题" --tagline=... --summary=...');
  }

  // 默认值：全部与 src/content.config.ts 的 products schema 一致
  title = String(title || '').trim();
  tagline = String(tagline || title).trim();
  summary = String(summary || tagline).trim();
  stage = stage || 'building';
  slug = slugify(slug || title);
  const published_at = flags.published_at || today();
  const status = flags.status || 'published';
  const visibility = flags.visibility || 'public';
  const locale = flags.locale || 'zh-CN';
  const tags = flags.tags ? flags.tags.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const url = flags.url || '';
  const repo_url = flags.repo_url || '';
  const cover = flags.cover || '';
  const launch_date = flags.launch_date || '';
  const updated_at = flags.updated_at || '';

  // 清晰的前置校验：坏值在写文件前就拦住，不留给 build 去猜
  if (!title) die('标题不能为空');
  if (!tagline) die('tagline 不能为空');
  if (!summary) die('summary 不能为空');
  if (!STAGES.includes(stage)) die(`未知阶段 ${stage}，只允许：${STAGES.join(', ')}`);
  if (!STATUSES.includes(status)) die(`未知 status ${status}，只允许：${STATUSES.join(', ')}`);
  if (!VISIBILITIES.includes(visibility)) die(`未知 visibility ${visibility}，只允许：${VISIBILITIES.join(', ')}`);
  if (!LOCALES.includes(locale)) die(`未知 locale ${locale}，只允许：${LOCALES.join(', ')}`);
  for (const [k, v] of [['published_at', published_at], ['launch_date', launch_date], ['updated_at', updated_at]]) {
    if (v && !DATE_RE.test(v)) die(`${k} 必须是 YYYY-MM-DD，收到：${v}`);
  }
  for (const [k, v] of [['url', url], ['repo_url', repo_url]]) {
    if (v && !/^https?:\/\//.test(v)) die(`${k} 必须是完整 http(s) 地址，收到：${v}`);
  }
  if (cover && !/^\.{1,2}\//.test(cover)) {
    die(`cover 必须是相对内容文件的路径（如 ../../assets/xxx.png），收到：${cover}`);
  }
  let featuredBool;
  let order;
  try {
    featuredBool = parseBool(featured, false);
    order = flags.order === undefined ? null : Number(flags.order);
    if (order !== null && (!Number.isInteger(order) || order < 0)) throw new Error('order 必须是非负整数');
  } catch (e) {
    die(e.message);
  }

  if (order === null) {
    const contents = existsSync(PRODUCTS_DIR)
      ? readdirSync(PRODUCTS_DIR)
          .filter((f) => /\.mdx?$/.test(f))
          .map((f) => readFileSync(join(PRODUCTS_DIR, f), 'utf8'))
      : [];
    order = nextOrder(contents);
  }

  const opts = {
    title, tagline, summary, stage, featured: featuredBool, order,
    published_at, status, visibility, tags, locale,
    slug, url, repo_url, cover, launch_date, updated_at,
  };

  let file = join(PRODUCTS_DIR, `${slug}.mdx`);
  let n = 2;
  while (existsSync(file)) file = join(PRODUCTS_DIR, `${slug}-${n++}.mdx`);

  mkdirSync(PRODUCTS_DIR, { recursive: true });
  writeFileSync(file, buildProductMdx(opts), 'utf8');

  const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
  const actualSlug = file.slice(PRODUCTS_DIR.length + 1, -4).replace(/\\/g, '/');
  console.log(`\n✓ 已生成：${rel}`);
  console.log(`  线上路径：/products/${actualSlug}/`);
  console.log(`  阶段：${stage}（${STAGE_HINTS[stage]}）  featured=${featuredBool}  order=${order}  status=${status}`);
  console.log('  填完正文直接 git add / commit / push 即发布。');
  if (status === 'draft') console.log('  ⓘ status=draft：本地 pnpm dev 可见，生产产物里不会出现。');
}

if (import.meta.main) {
  main().catch((e) => die(e.message));
}
