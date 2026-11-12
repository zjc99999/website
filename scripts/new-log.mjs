#!/usr/bin/env node
/**
 * 2 分钟写作流：生成一条创作日志的带模板 frontmatter 的 Markdown 文件。
 *
 * 用法：
 *   pnpm new:log "给首页做了 3 秒测试"                 # 终端里交互选类型
 *   pnpm new:log "标题" --kind=decision --summary="摘要"  # 非交互 / CI / 脚本
 *   pnpm new:log "标题" < /dev/null                   # 非交互，用默认值
 *
 * 双模式：process.stdin.isTTY 为真时交互提问；否则（管道、CI、重定向）
 * 直接采用默认值或命令行参数，绝不因 readline 收不到 EOF 而空转退出。
 *
 * 设计约束（规划书 E11）：从敲命令到得到一个可直接 git push 的文件 ≤2 分钟。
 * 只允许 6 种短类型；frontmatter 默认值全部对齐 src/content.config.ts 的 base。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const ROOT = resolve(import.meta.dirname, '..');
const LOG_DIR = join(ROOT, 'src', 'content', 'log');

const KINDS = ['build-log', 'decision', 'changelog', 'note', 'retro', 'now'];
const KIND_HINTS = {
  'build-log': '今天做了什么、怎么做的、结果如何',
  decision: '做了什么决定、为什么、放弃了什么',
  changelog: '改了什么、影响谁',
  note: '一个想法、一段摘录、一个观察',
  retro: '哪里没做好、下次怎么改',
  now: '最近在忙什么（短）',
};

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const slugify = (s) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\-\u4e00-\u9fa5]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'untitled';

// 解析命令行：位置参数拼成标题，--kind= / --summary= 作为可选覆盖
function parseArgs(argv) {
  const flags = { kind: null, summary: null };
  const words = [];
  for (const a of argv) {
    if (a.startsWith('--kind=')) flags.kind = a.slice('--kind='.length);
    else if (a.startsWith('--summary=')) flags.summary = a.slice('--summary='.length);
    else words.push(a);
  }
  return { title: words.join(' ').trim(), flags };
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

async function main() {
  const { title: argTitle, flags } = parseArgs(process.argv.slice(2));
  const interactive = Boolean(process.stdin.isTTY);

  let title = argTitle;
  let kind = flags.kind;
  let summary = flags.summary;

  let rl;
  if (interactive) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
    if (!title) title = await ask(rl, '标题（一句话）：');
    if (!kind) {
      console.log('\n类型：');
      KINDS.forEach((k, i) => console.log(`  ${i + 1}) ${k.padEnd(11)} ${KIND_HINTS[k]}`));
      const picked = await ask(rl, '选类型 [1-6，默认 1=build-log]：');
      const idx = Number(picked) - 1;
      kind = Number.isInteger(idx) && idx >= 0 && idx < KINDS.length ? KINDS[idx] : 'build-log';
    }
    if (!summary) summary = (await ask(rl, '一句话摘要（可回车用标题）：')) || title;
    rl.close();
  } else {
    // 非交互：缺什么补什么，不提问
    if (!title) {
      console.error('✗ 非交互模式必须提供标题：pnpm new:log "标题" [--kind=...] [--summary=...]');
      process.exit(1);
    }
    kind = kind || 'build-log';
    summary = summary || title;
  }

  if (!title) {
    console.error('✗ 标题不能为空');
    if (rl) rl.close();
    process.exit(1);
  }
  if (!KINDS.includes(kind)) {
    console.error(`✗ 未知类型 ${kind}，只允许：${KINDS.join(', ')}`);
    process.exit(1);
  }

  const date = today();
  const baseName = `${date}-${slugify(title)}`;
  let file = join(LOG_DIR, `${baseName}.md`);
  let n = 2;
  while (existsSync(file)) file = join(LOG_DIR, `${baseName}-${n++}.md`);

  mkdirSync(LOG_DIR, { recursive: true });

  const body = `---
title: ${title}
summary: ${summary}
kind: ${kind}
status: published
visibility: public
published_at: ${date}
tags: []
locale: zh-CN
related_ids: []
---

<!-- 在这里写正文。短一点没关系，100 字也算一条。
     可选项：product_id: <作品 id>（关联到某个作品）
     写完后：git add . && git commit -m "log: ${title}" && git push -->
`;

  writeFileSync(file, body, 'utf8');
  console.log(`\n✓ 已生成：${file.replace(ROOT + '\\', '')}`);
  console.log(`  类型：${kind}（${KIND_HINTS[kind]}）`);
  console.log('  填完正文直接 git push 即发布。');
}

main().catch((e) => {
  console.error('✗ 生成失败：', e.message);
  process.exit(1);
});
