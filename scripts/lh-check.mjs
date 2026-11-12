#!/usr/bin/env node
/**
 * M6 / G2 收尾：Lighthouse ≥95（真实分数，不是 CDP 自测的 LCP 推断）。
 *
 * API 已按 lighthouse@13.6.0 本机源码核验：
 *   - `import lighthouse, { desktopConfig } from 'lighthouse'`（default + 具名导出）
 *   - 程序式 API 不启动 Chrome：core/gather/navigation-runner.js:282
 *     `puppeteer.connect({browserURL: `http://${hostname}:${port}`, ...})`
 *     所以复用 cdp-harness.launchChrome() 已运行的 headless Chrome 的 port。
 *   - chromeFlags / outputPath / preset 是 CLI 专有，程序式忽略；改用 desktopConfig 作第 3 参。
 *   - runnerResult.lhr.categories.<id>.score 是 0–1，×100 才是展示分数。
 *
 * 零新增依赖：静态服务 / Chrome 起停用 cdp-harness.mjs。
 */
import lighthouse, { desktopConfig } from 'lighthouse';
import { startServer, launchChrome, ROOT, report } from './cdp-harness.mjs';
import { resolve } from 'node:path';

const DIST = resolve(ROOT, 'dist');
const THRESHOLD = 95;
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];

const server = await startServer({ root: DIST });
const cdp = await launchChrome();
try {
  const url = `${server.base}/`;
  const runnerResult = await lighthouse(
    url,
    {
      port: cdp.port,
      hostname: '127.0.0.1',
      logLevel: 'error',
      output: 'json',
      onlyCategories: CATEGORIES,
      formFactor: 'desktop',
      throttlingMethod: 'simulate',
    },
    desktopConfig,
  );

  const lhr = runnerResult.lhr;
  const scores = Object.fromEntries(
    CATEGORIES.map((id) => [id, Math.round((lhr.categories[id]?.score ?? 0) * 100)]),
  );
  const failedAudits = Object.values(lhr.audits ?? {})
    .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode === 'binary')
    .map((a) => a.id);

  report(
    'LH',
    {
      url,
      scores,
      threshold: THRESHOLD,
      // 便于排查：列出未满分的关键审计（不参与门禁，只是诊断信息）
      notableAudits: Object.fromEntries(
        Object.entries({
          'largest-contentful-paint': lhr.audits['largest-contentful-paint']?.displayValue,
          'cumulative-layout-shift': lhr.audits['cumulative-layout-shift']?.displayValue,
          'total-blocking-time': lhr.audits['total-blocking-time']?.displayValue,
          'speed-index': lhr.audits['speed-index']?.displayValue,
          interactive: lhr.audits.interactive?.displayValue,
        }).filter(([, v]) => v !== undefined),
      ),
      failedBinaryAudits: failedAudits.slice(0, 20),
      lighthouseVersion: lhr.lighthouseVersion,
    },
    CATEGORIES.map((id) => [
      `Lighthouse ${id} ≥ ${THRESHOLD}`,
      scores[id] >= THRESHOLD,
      `${scores[id]}`,
    ]),
  );
} catch (err) {
  console.error('[lh-check] FAILED:', err.stack ?? err.message);
  process.exitCode = 1;
} finally {
  await cdp.close();
  await new Promise((r) => server.server.close(r));
}
