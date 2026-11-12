/**
 * Playwright 配置（M6-d）。
 *
 * 本机没有下载 Playwright 自带浏览器（安装时 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1），
 * 因此用 launchOptions.executablePath 指向系统 Chrome；CI 里同样通过环境变量
 * PW_CHROME 覆盖（见 .github/workflows/ci.yml）。
 *
 * webServer 复用 scripts/serve.mjs：它是本项目自己的静态服务器，支持 clean URL、
 * 中文 slug，并会把 dist/_headers 里的 CSP 作为真实响应头发出——所以下面的
 * E2E 测到的是与托管平台一致的行为，而不是「少了一层安全头」的假环境。
 *
 * 前提：dist/ 已由 `pnpm build` 生成（pnpm ci 的顺序保证这一点）。
 */
import { defineConfig, devices } from '@playwright/test';

const CHROME =
  process.env.PW_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.PW_PORT ?? 4321);
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: CHROME },
      },
    },
  ],
  webServer: {
    command: `node scripts/serve.mjs ${PORT}`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
