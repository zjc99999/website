#!/usr/bin/env node
/**
 * 2 分钟写入流：生成一条「能力」(capabilities 集合) 的 .md 骨架。
 *
 * 用法：
 *   pnpm new:capability "全栈交付"                                  # 终端里交互补全
 *   pnpm new:capability "全栈交付" --category=工程 --statement="..." --evidence=products/atelier,log/2026-11-12-scaffold-works
 *   pnpm new:capability "标题" < /dev/null                          # 非交互，用默认值（必须给 --evidence）
 *
 * 为什么是「半自动」而不是「新建作品时自动生成」（与 new-product.mjs 骨架里的提示一致）：
 *  能力是从作品/日志里「事后抽象」出来的可复用证明，一条能力可跨多个作品与日志；
 *  新建作品时支撑它的日志还没写，自动生成只会得到空话 + 悬空证据（E4 构建期必失败）。
 *  本脚本只保证骨架合规、字段齐全、evidence_id 格式正确，内容仍需人工判断填写。
 *
 * 双模式纪律（与 new-product.mjs / new-log.mjs 一致）：
 *  - 零依赖，纯 Node；process.stdin.isTTY 为真才交互，否则直接取命令行参数与默认值，
 *    绝不因 readline 收不到 EOF 而空转退出。
 *  - 生成的 frontmatter 严格对齐 src/content.config.ts 的 capabilities schema，
 *    由真实 astro build 的 Zod + E4 校验兜底，脚本不另写一套「看起来对」的校验。
 *  - 用户文本一律用 JSON.stringify 输出成合法 YAML 双引号标量。
 *
 * 本模块导出纯函数（slugify / isValidEvidenceId / buildCapabilityMd），便于加回归测试；
 * 被 import 时不执行任何副作用（import.meta.main 为 false）。
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const ROOT = resolve(import.meta.dirname, '..');
const CAPS_DIR = join(ROOT, 'src', 'content', 'capabilities');

/** 与 src/content.config.ts / src/lib/evidence.ts 的 EVIDENCE_COLLECTIONS 保持一致 */
const EVIDENCE_COLLECTIONS = ['products', 'log', 'cases', 'capabilities', 'pages'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_CATEGORY = '工程';

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** 与 new-product.mjs 同款：保留中文与小写英文数字，其余压成连字符 */
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

/** evidence_id 必须是 "<集合名>/<id>"，且集合名在白名单内、id 非空 */
export function isValidEvidenceId(raw) {
  const s = String(raw || '');
  const slash = s.indexOf('/');
  if (slash <= 0 || slash === s.length - 1) return false;
  const collection = s.slice(0, slash);
  const id = s.slice(slash + 1);
  // id 里不能再含 '/'，否则 getEntry 拿到的 id 是 "/x" 这类，构建期必然找不到。
  if (id.includes('/')) return false;
  return EVIDENCE_COLLECTIONS.includes(collection);
}

/** 把逗号分隔的字符串（或数组）拆成 evidence_ids 数组，去除空项 */
export function parseEvidenceIds(raw) {
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 列出某集合已有条目的 id（取文件名，去扩展名），用于交互时提示真实可选证据 */
function existingIds(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.(md|mdx|json)$/.test(f))
    .map((f) => f.replace(/\.(md|mdx|json)$/, ''))
    .sort();
}

/** 正文骨架（.md 用 HTML 注释，与 new-log.mjs 一致；不是 MDX） */
function body(title) {
  return `<!--
在这里写正文：为什么这条能力成立？下面几条证据各自证明了什么、如何串起来？
短一点没关系，重点是「看证据」而不是「精通 XXX」式的自夸。

E4 提醒：evidence_ids 里的每条都必须在构建期指向真实条目，否则 astro build 会失败。
  作品：products/<id>  → src/content/products/
  日志：log/<id>       → src/content/log/
  案例：cases/<id>     → src/content/cases/  （需 consent: true）

写完：git add . && git commit -m "capability: ${title}" && git push
-->
`;
}

/** 纯函数：按已校验的 opts 生成完整 .md 文本（capabilities 是 .md，不是 .mdx） */
export function buildCapabilityMd(o) {
  const lines = [
    `title: ${q(o.title)}`,
    `summary: ${q(o.summary)}`,
    `category: ${q(o.category)}`,
    `statement: ${q(o.statement)}`,
    `status: ${o.status}`,
    `visibility: ${o.visibility}`,
    `published_at: ${o.published_at}`,
    `tags: ${JSON.stringify(o.tags)}`,
    `locale: ${o.locale}`,
    'evidence_ids:',
    ...o.evidence_ids.map((id) => `  - ${q(id)}`),
  ];
  return `---\n${lines.join('\n')}\n---\n\n${body(o.title)}`;
}

/** 解析命令行：--key=value 进 flags，其余位置词拼成标题 */
function parseArgs(argv) {
  const flags = {};
  const words = [];
  for (const a of argv) {
    if (a.startsWith('--') && a.includes('=')) {
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
  const { positionalTitle, flags } = parseArgs(process.argv.slice(2));
  const interactive = Boolean(process.stdin.isTTY);

  let title = flags.title || positionalTitle;
  let summary = flags.summary;
  let category = flags.category;
  let statement = flags.statement;
  let evidenceRaw = flags.evidence !== undefined ? flags.evidence : flags.evidence_ids;
  let slug = flags.slug;

  let rl;
  if (interactive) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
    if (!title) title = await ask(rl, '能力名（一句话，如「全栈交付」）：');
    if (!summary) summary = (await ask(rl, '一句话摘要（可回车用能力名）：')) || title;
    if (!category) category = (await ask(rl, `分类（可回车用「${DEFAULT_CATEGORY}」）：`)) || DEFAULT_CATEGORY;
    if (!statement) {
      statement = (await ask(rl, '可验证的一句陈述（可回车用摘要；如「能把…落到…」）：')) || summary;
    }
    if (evidenceRaw === undefined) {
      const products = existingIds(join(ROOT, 'src', 'content', 'products'));
      const logs = existingIds(join(ROOT, 'src', 'content', 'log'));
      console.log('\n可选证据（已存在的条目，格式 集合/id）：');
      if (products.length) console.log('  products: ' + products.join(', '));
      if (logs.length) console.log('  log:      ' + logs.join(', '));
      console.log('  （也可用 cases / capabilities / pages 下已存在的 id）\n');
      evidenceRaw = await ask(rl, '证据 id（逗号分隔，至少一个）：');
    }
    if (!slug) slug = await ask(rl, 'URL 短名（回车用能力名生成，建议英文短名）：');
    rl.close();
  } else if (!title) {
    die('非交互模式必须提供能力名：pnpm new:capability "能力名" --evidence=products/atelier');
  }

  // 默认值（非交互模式缺什么补什么，不提问）
  title = String(title || '').trim();
  summary = String(summary || title).trim();
  category = String(category || DEFAULT_CATEGORY).trim();
  statement = String(statement || summary).trim();
  slug = slugify(slug || title);
  const published_at = flags.published_at || today();
  const status = flags.status || 'published';
  const visibility = flags.visibility || 'public';
  const locale = flags.locale || 'zh-CN';
  const tags = flags.tags ? flags.tags.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const evidence_ids = parseEvidenceIds(evidenceRaw);

  // 前置校验：坏值在写文件前就拦住，不留给 build 去猜
  if (!title) die('能力名不能为空');
  if (!summary) die('summary 不能为空');
  if (!category) die('category 不能为空');
  if (!statement) die('statement 不能为空');
  if (!DATE_RE.test(published_at)) die(`published_at 必须是 YYYY-MM-DD，收到：${published_at}`);
  if (!['draft', 'published'].includes(status)) die(`未知 status ${status}，只允许 draft/published`);
  if (!['public', 'unlisted', 'private'].includes(visibility)) die(`未知 visibility ${visibility}`);
  if (!['zh-CN', 'en'].includes(locale)) die(`未知 locale ${locale}`);
  if (evidence_ids.length === 0) {
    die('evidence_ids 至少要有一条（E4：无证据的能力不允许发布）；用 --evidence=products/atelier 提供');
  }
  const bad = evidence_ids.filter((id) => !isValidEvidenceId(id));
  if (bad.length) {
    die(`证据 id 格式错误：${bad.join(', ')}；必须是 "<集合名>/<id>"，集合限于 ${EVIDENCE_COLLECTIONS.join(', ')}`);
  }

  const opts = {
    title, summary, category, statement, status, visibility, published_at,
    tags, locale, slug, evidence_ids,
  };

  let file = join(CAPS_DIR, `${slug}.md`);
  let n = 2;
  while (existsSync(file)) file = join(CAPS_DIR, `${slug}-${n++}.md`);

  mkdirSync(CAPS_DIR, { recursive: true });
  writeFileSync(file, buildCapabilityMd(opts), 'utf8');

  const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
  const actualSlug = file.slice(CAPS_DIR.length + 1, -3).replace(/\\/g, '/');
  console.log(`\n✓ 已生成：${rel}`);
  console.log(`  线上路径：/capabilities#${actualSlug}`);
  console.log(`  分类：${category}  证据 ${evidence_ids.length} 条：${evidence_ids.join(', ')}`);
  console.log('  填完正文直接 git add / commit / push 即发布（build 会校验证据是否真实存在）。');
}

if (import.meta.main) {
  main().catch((e) => die(e.message));
}
