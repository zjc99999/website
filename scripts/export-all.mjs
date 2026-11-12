#!/usr/bin/env node
/**
 * 内容主权（规划书 E3）：一键导出全量明文内容与订阅者 CSV。
 *
 * R1 阶段：把 src/content/** 与 profile.json 原样复制到 exports/<时间戳>/，
 * 并生成 MANIFEST.json（含文件数、字节数、git HEAD，便于核对）。
 * 订阅者导出：R1 方案 A 用第三方表单，暂无本地订阅者文件；
 * 预留 subscribers.csv 的空模板（表头对齐概要设计 5.3 subscriber 实体），
 * R1.5/B 方案接入自有线索池后由对应脚本填充。
 *
 * 用法：pnpm export:all
 */
import { cpSync, mkdirSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src', 'content');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = join(ROOT, 'exports', stamp);

if (!statSync(SRC, { throwIfNoEntry: false })) {
  console.error('✗ 找不到 src/content/');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
cpSync(SRC, join(OUT, 'content'), { recursive: true });

let head = '';
try {
  head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
} catch {
  head = '(not a git repo)';
}

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
const files = walk(join(OUT, 'content')).map((f) => ({
  path: relative(OUT, f).replace(/\\/g, '/'),
  bytes: statSync(f).size,
}));

writeFileSync(
  join(OUT, 'MANIFEST.json'),
  JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      git_head: head,
      source: 'src/content/**',
      files,
      note: '全部内容为明文 Markdown/MDX/JSON，可直接用任意编辑器打开或迁移。',
    },
    null,
    2,
  ),
  'utf8',
);

// 订阅者导出位：R1 无本地订阅者数据，先固定表头，保证 R1.5 起格式不变。
writeFileSync(
  join(OUT, 'subscribers.csv'),
  'email,consent_at,consent_source,status,tags,source,unsubscribed_at\n',
  'utf8',
);

console.log(`✓ 导出完成：exports/${stamp}/`);
console.log(`  内容文件 ${files.length} 个；MANIFEST.json 已记录 git HEAD ${head.slice(0, 8)}`);
console.log('  subscribers.csv 为空模板（R1 方案 A 无本地订阅者数据）');
