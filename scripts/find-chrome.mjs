#!/usr/bin/env node
/**
 * 跨平台 Chrome / Chromium 定位（M7 准备）。零依赖，只用 node 内置模块。
 *
 * 为什么单独抽出来：M4~M6 的浏览器回归脚本各自写死了 Windows 路径
 *   'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
 * 这在 Linux/macOS 的 GitHub 托管 runner 上不成立。本模块把「找到浏览器」
 * 变成一处可复用的、按平台探测的逻辑，并保留环境变量显式覆盖的优先级。
 *
 * 解析顺序（findChrome()）：
 *   1) CHROME_PATH / PW_CHROME 显式覆盖（最高优先级，CI/本机都可用）；
 *   2) 当前平台的常见安装绝对路径；
 *   3) 扫描 PATH 里的常见可执行名（google-chrome-stable / chromium / ...）。
 *   都找不到则抛出可读错误，而不是让 spawn 报一个含糊的 ENOENT。
 *
 * 惰性：只在真正要启动浏览器时调用；serve.mjs 会 import cdp-harness.mjs 但
 * 不需要浏览器，所以不能在模块顶层解析/抛错。
 *
 * 用法：
 *   import { findChrome } from './find-chrome.mjs';  // 返回绝对路径
 *   node scripts/find-chrome.mjs                       // CLI：打印路径，供 CI 导出环境用
 * 刻意不使用 import.meta / fileURLToPath —— 这样它既能被 ESM 直接 import，
 * 也能被 Playwright 的 esbuild 转译（CJS 或 ESM 皆可）。
 */
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

const isExecutable = (p) => {
  if (!p) return false;
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

/** 平台 -> 常见安装绝对路径（按优先级）。 */
const CANDIDATES = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : '',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean),
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
    '/snap/bin/chromium',
  ],
};

/** 平台 -> 在 PATH 中查找的可执行名（按优先级）。 */
const COMMANDS = {
  win32: ['chrome.exe', 'msedge.exe'],
  darwin: ['google-chrome', 'chromium', 'chrome'],
  linux: ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'chrome'],
};

function fromPath() {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const cmd of COMMANDS[process.platform] ?? COMMANDS.linux) {
    for (const dir of dirs) {
      const candidate = join(dir, cmd);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return undefined;
}

/** 返回可执行的 Chrome/Chromium 绝对路径；找不到则抛出可读错误。 */
export function findChrome() {
  const override = process.env.CHROME_PATH || process.env.PW_CHROME;
  if (override) {
    if (isExecutable(override)) return override;
    throw new Error(
      `[find-chrome] CHROME_PATH/PW_CHROME 指向 "${override}"，但该文件不存在或不可执行`,
    );
  }
  const platform = process.platform;
  for (const p of CANDIDATES[platform] ?? CANDIDATES.linux) {
    if (isExecutable(p)) return p;
  }
  const onPath = fromPath();
  if (onPath) return onPath;
  throw new Error(
    `[find-chrome] 未找到 Chrome/Chromium（platform=${platform}）。` +
      ' 请安装浏览器，或设置 CHROME_PATH 指向可执行文件。',
  );
}

// CLI 模式：node scripts/find-chrome.mjs —— 打印路径，供 CI 写入 GITHUB_ENV。
// 仅在被直接执行时触发，被 import 时不产生任何输出。
if (process.argv[1] && /(?:^|[\\/])find-chrome\.mjs$/.test(process.argv[1])) {
  try {
    console.log(findChrome());
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
