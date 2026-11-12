#!/usr/bin/env node
/**
 * M6 / axe a11y 回归（零新增依赖）。
 *
 * 复用 cdp-harness：静态托管 dist/ + headless Chrome + CDP。
 * 注入 axe-core@4.14.0 的 axe.min.js（createRequire 解析真实路径），
 * 对 5 个代表性页面跑 axe.run() 并断言 violations 为空。
 * 用 data-pagefind-ignore 的搜索页不纳入（UI 是动态注入的第三方组件，
 * 由 verify-search.mjs 单独覆盖其可用性）。
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { startServer, launchChrome, navigate, ROOT, report } from './cdp-harness.mjs';

const DIST = resolve(ROOT, 'dist');
const require = createRequire(import.meta.url);
const axeSrc = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');

const PAGES = ['/', '/products/', '/log/', '/capabilities/', '/about/'];

const server = await startServer({ root: DIST });
const cdp = await launchChrome();
try {
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const perPage = {};
  let totalViolations = 0;
  let axeVersion = '';
  for (const path of PAGES) {
    const url = server.base + path;
    if (!(await navigate(cdp.send, cdp.evaluate, url))) {
      perPage[path] = { error: '导航超时' };
      totalViolations += 1;
      continue;
    }
    // 注入库本身；末尾 `;0` 避免 CDP returnByValue 去序列化巨大的 axe 对象
    await cdp.evaluate(axeSrc + '\n;0');
    const result = await cdp.evaluate(`(async () => {
      const r = await axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
      });
      return {
        version: axe.version,
        violations: r.violations.map((v) => ({
          id: v.id, impact: v.impact,
          nodes: v.nodes.slice(0, 3).map((n) => ({ target: n.target, summary: n.failureSummary })),
        })),
      };
    })()`);
    axeVersion = result.version;
    perPage[path] = result.violations;
    totalViolations += result.violations.length;
  }

  report(
    'AXE',
    { axeVersion, pagesChecked: PAGES.length, totalViolations, perPage },
    [['所有受检页面 axe violations 为 0', totalViolations === 0, String(totalViolations)]],
  );
} catch (err) {
  console.error('[axe-check] FAILED:', err.stack ?? err.message);
  process.exitCode = 1;
} finally {
  await cdp.close();
  await new Promise((r) => server.server.close(r));
}
