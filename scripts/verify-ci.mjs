#!/usr/bin/env node
/**
 * M6-f：验证「CI 这条链本身」没有断，而不是再测一遍站点。
 *
 * WBS DoD 要求「故意破坏一条 schema 时 CI 必须红」。那条红线由两部分共同保证：
 *  1. `test:rules` 真的把违规内容写进去、断言 astro build 非 0（M2/M3 已实测）；
 *  2. `quality` 链里既有 `test:rules`，也有真实的 `build` —— 因此任何人把
 *     违规内容提交进仓库，CI 的构建步也必然失败。
 * 本脚本检查的是第 2 点的**接线**：脚本链是否完整、ci.yml 是否引用了存在的
 * 脚本、有没有测试被漏在链外（写了但从不在 CI 跑 = 假绿）、以及密钥 hygiene。
 *
 * 它刻意不做「起一个假 CI」这种自欺的事：CI 是否绿由 pnpm run quality 的真实
 * 退出码决定，本脚本只保证「该跑的都在链上」。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { scan } from './secret-scan.mjs';

const ROOT = process.cwd();
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const yml = existsSync(join(ROOT, '.github/workflows/ci.yml'))
  ? readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')
  : '';

const checks = [];
const check = (name, ok, actual = '') => checks.push({ name, ok, actual });

// 1. 所有 test:* 回归脚本都要能从 quality / quality:browser 两条根链到达
//    （允许间接：quality:browser → test:e2e → test:perf 等）。写了却永不执行 = 假绿。
const refs = (cmd) => [...(cmd ?? '').matchAll(/pnpm(?:\s+run)?\s+([A-Za-z0-9:_-]+)/g)].map((m) => m[1]);
const reachable = new Set(['quality', 'quality:browser', 'build']);
const queue = ['quality', 'quality:browser'];
while (queue.length) {
  const cur = queue.shift();
  for (const r of refs(pkg.scripts[cur])) {
    if (pkg.scripts[r] && !reachable.has(r)) { reachable.add(r); queue.push(r); }
  }
}
const testScripts = Object.keys(pkg.scripts).filter((k) => k.startsWith('test:'));
const orphans = testScripts.filter((k) => !reachable.has(k));
check('无孤立回归脚本（每个 test:* 都可达 quality 链）', orphans.length === 0, orphans.join(',') || 'ok');
check('test:e2e 本身可达', reachable.has('test:e2e') ? 'yes' : 'no');

// 2. quality 链（含间接引用）必须包含「真构建 + 故意破 schema 必红 + CSP 生成 + 单测」
//    test:rules/test:unit 是经 `test` → 间接进来的，所以用可达性而非字符串包含判断。
for (const need of ['build', 'test:rules', 'test:csp', 'test:unit', 'test']) {
  check(`quality 链可达 ${need}`, reachable.has(need), 'yes/no');
}
// 3. browser 链（含间接引用）必须包含 Lighthouse / axe / Playwright 与两条 M5 DoD
for (const need of ['test:lh', 'test:axe', 'test:pw', 'test:lead', 'test:nodynamic']) {
  check(`quality:browser 链可达 ${need}`, reachable.has(need), 'yes/no');
}

// 4. ci.yml 四段串行且引用的脚本都存在
const jobs = [...yml.matchAll(/^  ([a-z-]+):\n    name:/gm)].map((m) => m[1]);
check('ci.yml 有 4 个 job', jobs.length === 4, jobs.join(','));
for (const need of ['quality', 'quality:browser', 'test']) {
  check(`ci.yml 引用 ${need}`, yml.includes(need), 'yes/no');
}
check('ci.yml 串行（needs 链）', (yml.match(/needs:/g) || []).length >= 3, 'yes/no');

// 5. 密钥 hygiene：与 CI 的 audit job 共用 scripts/secret-scan.mjs 这一个引擎。
//    M7 首推时两边各写一份规则（远端 git grep 过宽→假红、本地 JS 遇中文文件名
//    八进制转义静默跳过→假绿），行为不一致。现在规则与执行都只有一处。
const hygiene = scan({ root: ROOT });
check('CI 与本地共用同一密钥扫描引擎', hygiene.ciUsesSharedEngine, 'yes/no');
check('密钥规则不自匹配（无需白名单打补丁）', !hygiene.ruleMatchesSelf, 'yes/no');
check('无 .env 文件入库', hygiene.envFiles.length === 0, hygiene.envFiles.join(',') || 'ok');
check('无密钥字面量入库', hygiene.withSecret.length === 0, hygiene.withSecret.join(',') || 'ok');
check('所有被跟踪文件都可读取（无静默跳过）', hygiene.skipped.length === 0, hygiene.skipped.join(',') || 'ok');
check('密钥扫描确实扫到了文件（非假绿）', hygiene.scanned > 0, `scanned=${hygiene.scanned}`);

// 6. 关键文件存在
for (const f of ['public/_headers', '.github/dependabot.yml', 'playwright.config.ts', 'vitest.config.ts']) {
  check(`存在 ${f}`, existsSync(join(ROOT, f)), 'yes/no');
}

// 把布尔型检查的占位值统一成可读的 yes/no
for (const c of checks) if (c.actual === 'yes/no') c.actual = c.ok ? 'yes' : 'no';
const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.actual ? ` → ${c.actual}` : ''}`);
console.log(`@@CI@@ ${JSON.stringify({ verdict: failed.length ? 'FAIL' : 'PASS', checks: checks.length, failed: failed.length, jobs })}`);
if (failed.length) process.exitCode = 1;
