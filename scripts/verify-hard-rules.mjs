#!/usr/bin/env node
/**
 * M2 DoD 自动化测试：两条构建期硬校验（规划书 E4）被违反时，astro build 必须失败。
 *
 * 做法：把一条故意违规的内容写入临时文件 → 跑 `astro build` → 断言退出码非 0
 *      且 stderr 含可读错误 → 删除临时文件 → 再跑一次 build 确认恢复正常。
 * 这样既验证了「拦得住」，也验证了「不会污染仓库」。
 *
 * 用法：pnpm test:rules
 */
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const NODE = process.execPath;
const PNPM = process.env.DSH_PNPM || 'pnpm';

const CASES = [
  {
    name: 'E4-a capability.evidence_ids 为空 → build 必须失败',
    file: join(ROOT, 'src', 'content', 'capabilities', '__invalid_no_evidence.md'),
    body: `---
title: 无证据的能力
summary: 故意违规用于测试
category: 测试
statement: 这条能力不该被发布
status: published
visibility: public
published_at: 2026-11-12
tags: []
locale: zh-CN
evidence_ids: []
---

故意违规。
`,
    expect: 'evidence_ids',
  },
  {
    name: 'E4-b case_study.consent 不是 true → build 必须失败',
    file: join(ROOT, 'src', 'content', 'cases', '__invalid_no_consent.mdx'),
    body: `---
title: 未授权案例
summary: 故意违规用于测试
client: 某客户
problem: 测试问题
solution: 测试方案
status: published
visibility: public
published_at: 2026-11-12
tags: []
locale: zh-CN
consent: false
consent_at: 2026-11-12
---

故意违规。
`,
    expect: 'consent',
  },
];

const runBuild = () =>
  spawnSync(NODE, [PNPM, 'build'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' },
  });

let failed = 0;
for (const c of CASES) {
  writeFileSync(c.file, c.body, 'utf8');
  const r = runBuild();
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const blocked = r.status !== 0;
  const readable = out.includes(c.expect) || out.includes('InvalidContentEntryDataError');
  if (blocked && readable) {
    console.log(`✓ ${c.name}（退出码 ${r.status}，错误可读）`);
  } else {
    console.error(
      `✗ ${c.name}：blocked=${blocked} readable=${readable}\n${out.slice(-1200)}`,
    );
    failed++;
  }
  rmSync(c.file, { force: true });
}

// 清理后再构建一次，确认仓库回到可发布状态
if (CASES.some((c) => existsSync(c.file))) {
  console.error('✗ 临时违规文件未被清理');
  failed++;
}
const clean = runBuild();
if (clean.status !== 0) {
  console.error(`✗ 清理后 build 仍失败：\n${(clean.stderr || '').slice(-1200)}`);
  failed++;
} else {
  console.log('✓ 清理后 build 恢复正常（EXIT=0）');
}

if (failed > 0) {
  console.error(`\n${failed} 项未通过`);
  process.exit(1);
}
console.log('\n全部通过：两条硬校验均被构建期拦截，且仓库可恢复。');
