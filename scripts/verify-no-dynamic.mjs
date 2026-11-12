#!/usr/bin/env node
/**
 * M5 DoD ④ 回归：拔掉动态层，读路径仍完整可用（不变量实测）。
 *
 * 概要设计 5.1 的唯一不变量：「即使动态层全部宕机，网站（读）仍完整可用」。
 * 之前只在架构图上成立，本脚本把它变成一次可复现的实测：
 *
 *   1) 用「全部动态配置都接上」的构建探针（表单端点 / 预约外链 / Umami 脚本，
 *      全部指向一个不可达的 .invalid 主机）；
 *   2) 在 Chrome 里用 Network.setBlockedURLs 把这些第三方请求全部拦掉
 *      —— 这就是「拔掉动态层」，且不是靠注释掉的假配置；
 *   3) 依次打开 首页 / 作品列表 / 作品详情 / 创作日志列表 / 日志详情，
 *      断言每页 h1、正文、导航、图片都完整可读，且**没有任何首方资源加载失败**；
 *   4) 同时断言第三方请求确实失败了（否则「拔掉」没发生，测试是假的）。
 *
 * 零新增依赖，复用 cdp-harness.mjs。用法：node scripts/verify-no-dynamic.mjs
 * （自己构建到 .m5-nodynamic-probe，不依赖也不污染 dist/）
 */
import {
  ROOT,
  startServer,
  buildProbe,
  launchChrome,
  navigate,
  report,
  removeProbe,
  sleep,
} from './cdp-harness.mjs';
import { resolve } from 'node:path';

const OUT = resolve(ROOT, '.m5-nodynamic-probe');
const DEAD_HOST = 'offline-dynamic.invalid';
// 必须是 PUBLIC_ 前缀：Vite 只把 PUBLIC_ 变量内联进静态产物（见 src/lib/config.ts）。
// 用不带前缀的键会让「动态层」根本没被启用，测试就变成假的了。
const THIRD_PARTY = {
  PUBLIC_FORM_ENDPOINT: `https://forms.${DEAD_HOST}/lead`,
  PUBLIC_CONTACT_EMAIL: 'author@example.com',
  PUBLIC_CAL_URL: `https://cal.${DEAD_HOST}/30min`,
  PUBLIC_UMAMI_SCRIPT_URL: `https://analytics.${DEAD_HOST}/script.js`,
  PUBLIC_UMAMI_WEBSITE_ID: 'probe-website-id',
};

const httpServer = await startServer();
const base = httpServer.base;
let chrome;

try {
  const built = buildProbe({ outDir: OUT, env: { ...THIRD_PARTY } });
  if (!built.ok) {
    console.log('@@NODYNAMIC@@ ' + JSON.stringify({ verdict: 'FAIL', reason: 'probe build failed' }));
    console.error(built.output.slice(-3000));
    process.exitCode = 1;
  } else {
    httpServer.state.root = OUT;

    chrome = await launchChrome();
    const { send, evaluate, on } = chrome;
    const reqUrls = new Map();
    const failed = [];
    on((msg) => {
      if (msg.method === 'Network.requestWillBeSent') {
        reqUrls.set(msg.params.requestId, msg.params.request.url);
      }
      if (msg.method === 'Network.loadingFailed') {
        failed.push({
          url: reqUrls.get(msg.params.requestId) ?? '(unknown)',
          error: msg.params.errorText,
          blockedReason: msg.params.blockedReason ?? '',
        });
      }
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    // 给一个很高的视口，让 loading="lazy" 的封面图也进入视口并真实加载，
    // 否则「未加载的懒加载图」会被误判成「坏图」。
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 3000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    // 「拔掉动态层」：所有第三方主机一律拦截，连 DNS 都不让走
    await send('Network.setBlockedURLs', { urls: [`*${DEAD_HOST}*`] });

    const readPage = async (path) => {
      const ok = await navigate(send, evaluate, `${base}${path}`);
      if (!ok) return { path, error: 'navigate timeout' };
      // 给图片解码一点时间
      await sleep(150);
      return {
        path,
        ...(await evaluate(`(() => {
          const main = document.querySelector('main');
          const h1 = document.querySelector('h1');
          const imgs = Array.from(document.querySelectorAll('main img'));
          return {
            title: document.title,
            h1: h1 ? h1.innerText.trim() : '',
            mainTextLen: main ? main.innerText.trim().length : 0,
            navCount: document.querySelectorAll('nav a').length,
            imgCount: imgs.length,
            imgBroken: imgs.filter((i) => !i.complete || i.naturalWidth === 0).length,
            hasFooter: !!document.querySelector('footer'),
          };
        })()`)),
      };
    };

    const pages = [];
    pages.push(await readPage('/'));
    pages.push(await readPage('/products/'));
    pages.push(await readPage('/log/'));

    // 从列表页发现真实详情链接，避免把 slug 写死
    await navigate(send, evaluate, `${base}/products/`);
    const productHref = await evaluate(
      `(() => { const a = document.querySelector('main a[href^="/products/"]'); return a ? a.getAttribute('href') : ''; })()`,
    );
    await navigate(send, evaluate, `${base}/log/`);
    const logHref = await evaluate(
      `(() => { const a = document.querySelector('main a[href^="/log/"]'); return a ? a.getAttribute('href') : ''; })()`,
    );
    if (productHref) pages.push(await readPage(productHref));
    if (logHref) pages.push(await readPage(logHref));

    const thirdPartyFailed = failed.filter((f) => f.url.includes(DEAD_HOST));
    const firstPartyFailed = failed.filter(
      (f) => f.url.startsWith(base) && !f.url.includes(DEAD_HOST),
    );
    const otherFailed = failed.filter(
      (f) => !f.url.includes(DEAD_HOST) && !f.url.startsWith(base),
    );
    // 完整可读 = 有 h1 / 正文非空 / 导航在 / 图片无损坏。
    // 下限取 50 而非 200：/products/ 这类聚合列表页本就只有一张卡片（实测 162 字），
    // 它是「正常的短页」，不是被动态层拔坏的空页；用高阈值会把合法页面误判为失败。
    const allReadable = pages.every(
      (p) =>
        !p.error &&
        p.h1.length > 0 &&
        p.mainTextLen > 50 &&
        p.navCount >= 1 &&
        p.imgBroken === 0,
    );
    const checks = [
      [
        '动态层确实被拔掉（第三方请求失败，非假配置）',
        thirdPartyFailed.length > 0,
        `${thirdPartyFailed.length} 个：${thirdPartyFailed.map((f) => f.blockedReason || f.error || 'blocked').join(', ')}`,
      ],
      [
        `读路径 ${pages.length} 个页面全部完整可读（h1/正文/导航/图片）`,
        allReadable && pages.length >= 5,
        pages.map((p) => `${p.path}:h1=${p.h1 && p.h1.length ? 'Y' : 'N'},text=${p.mainTextLen},img=${p.imgCount}/${p.imgBroken}坏`).join(' | '),
      ],
      [
        '首页 / 作品 / 日志（含详情页）无首方资源加载失败',
        firstPartyFailed.length === 0,
        firstPartyFailed.map((f) => `${f.url} ${f.error}`).join('; ') || '0',
      ],
      [
        '除被拦截的第三方外无其他加载失败',
        otherFailed.length === 0,
        otherFailed.map((f) => `${f.url} ${f.error}`).join('; ') || '0',
      ],
    ];
    report(
      'NODYNAMIC',
      { pages, thirdPartyFailed, firstPartyFailed, otherFailed, blockedPatterns: [`*${DEAD_HOST}*`] },
      checks,
    );
  }
} catch (err) {
  console.error(`[verify-no-dynamic] FAILED: ${err.stack ?? err.message}`);
  process.exitCode = 1;
} finally {
  try {
    chrome?.close();
  } catch {
    /* ignore */
  }
  httpServer.server.close();
  await removeProbe(OUT);
}
