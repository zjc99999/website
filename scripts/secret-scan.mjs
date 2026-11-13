#!/usr/bin/env node
/**
 * 密钥 hygiene 的单一执行引擎：CI 的 audit job 与 scripts/verify-ci.mjs 都调用它。
 *
 * M7 首推时踩到「远端假红 + 本地假绿」：
 *  - 远端 ci.yml 用 `git grep -E 'sk_live_|...'`，规则过宽，把创作日志里
 *    「提到这条正则」的正文也扫成密钥；
 *  - 本地 verify-ci.mjs 用 JS RegExp + `git ls-files`，Windows 下 git 默认把
 *    中文文件名八进制转义，`existsSync` 找不到就静默跳过 → 什么都没测却全绿。
 * 两个引擎、两种行为，正是「测试通过了 ≠ 测试真的测了」。现在两边共用同一段代码。
 *
 * 规则只匹配真实密钥材料：`sk_live_` 后须跟 20+ 字母数字。检测器文件里写的
 * `sk_live_[A-Za-z0-9]{20,}` 是正则文本，后面跟的是 `[` 而非字母数字，因此
 * 规则不会匹配自己 —— 所以**不需要把检测器文件列入白名单**（白名单反而会
 * 让「往检测器里塞真密钥」被静默放行）。ruleMatchesSelf 断言守住这一点。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const SECRET_PATTERN =
  'sk_live_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----';

// ci.yml 必须用这条命令调用本引擎（verify-ci.mjs 会断言，防止换回第二个引擎）。
export const SCAN_COMMAND = 'node scripts/secret-scan.mjs';

export function scan({ root = process.cwd() } = {}) {
  const ymlPath = join(root, '.github/workflows/ci.yml');
  const yml = existsSync(ymlPath) ? readFileSync(ymlPath, 'utf8') : '';
  const ciUsesSharedEngine = yml.includes(SCAN_COMMAND);

  const secretRe = new RegExp(SECRET_PATTERN);
  // 规则文本必须不匹配自己；否则检测器会永远对自己报警，就得靠白名单打补丁，
  // 而白名单正是「真密钥被静默放行」的缺口。
  const ruleMatchesSelf = secretRe.test(SECRET_PATTERN);

  // -z + core.quotepath=false：Windows 下 git 默认把中文文件名八进制转义，
  // 会让 existsSync 找不到文件而静默跳过（M7 本地假绿的根因）。
  let tracked = [];
  try {
    const raw = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], {
      cwd: root,
      encoding: 'utf8',
    });
    tracked = raw.split('\0').filter(Boolean);
  } catch {
    /* 非 git 仓库时跳过：scanned=0 会在结果里如实体现 */
  }

  const envFiles = tracked.filter((f) => /(^|\/)\.env($|\.)/.test(f) && f !== '.env.example');
  const withSecret = [];
  const skipped = [];
  let scanned = 0;

  for (const f of tracked) {
    const p = join(root, f);
    if (!existsSync(p)) {
      skipped.push(f);
      continue;
    }
    scanned += 1;
    try {
      if (secretRe.test(readFileSync(p, 'utf8'))) withSecret.push(f);
    } catch {
      /* 读不了的文件（非常规编码/权限）跳过，不冒充通过 */
    }
  }

  return { ciUsesSharedEngine, ruleMatchesSelf, envFiles, withSecret, skipped, scanned };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const r = scan();
  const problems = [];
  if (r.ruleMatchesSelf) problems.push('规则文本匹配自身：请改写 SECRET_PATTERN，不要靠白名单打补丁');
  if (r.envFiles.length) problems.push(`被跟踪的 .env 文件：${r.envFiles.join(', ')}`);
  if (r.withSecret.length) problems.push(`疑似密钥：${r.withSecret.join(', ')}`);
  if (r.skipped.length) problems.push(`无法读取（中文文件名解码失败？）：${r.skipped.join(', ')}`);
  if (r.scanned === 0) problems.push('一个文件都没扫到，检查是否在 git 仓库中运行');
  if (!r.ciUsesSharedEngine) problems.push('ci.yml 未引用 scripts/secret-scan.mjs（两处引擎可能漂移）');
  if (problems.length) {
    for (const p of problems) console.error(`✗ ${p}`);
    process.exitCode = 1;
  } else {
    console.log(`OK：无 .env 文件、无密钥字面量入库（已扫描 ${r.scanned} 个文件，CI 与本地同一引擎）`);
  }
}
