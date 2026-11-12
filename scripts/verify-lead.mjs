#!/usr/bin/env node
/**
 * M5 DoD ① + ② + ③ 回归：线索提交闭环（方案 A，零新增依赖）。
 *
 * 在真实 Chrome 里对「带 PUBLIC_ 配置」的探针构建提交一次订阅表单和一次联系表单，
 * 由本地 HTTP 端点捕获 POST，断言字段齐全、来源留痕、蜜罐为空、浏览器收到回执；
 * 同时断言邮件兜底链接在端点存在时依然保留（DoD ②），订阅页含同意与退订说明（DoD ③）。
 *
 * 诚实边界（重要）：
 *   本脚本能证明「访客的提交被完整 POST 到端点、端点回了成功页面」。
 *   「作者真的收到邮件 / 第三方通知」属于外部送达，需要用户在 M7 配置真实端点
 *   （如 Formspree / 自建 Serverless + Resend）后人工确认一次，脚本不冒充该结论。
 *   规划书 M5 DoD ① 的最终环节因此在执行日志里单列「待人工实测」。
 *
 * 用法：node scripts/verify-lead.mjs（不依赖 dist/，自己构建到 .m5-lead-probe）
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

const OUT = resolve(ROOT, '.m5-lead-probe');
const TEST_EMAIL = 'lead@example.com';
const posts = [];
const failedUrls = [];

const httpServer = await startServer({
  onPost: (p) => posts.push(p),
});
const base = httpServer.base;
const endpoint = `${base}/lead`;

let chrome;
try {
  // 1) 先把动态层「全部接上」构建一份探针产物（不污染 dist/）
  const built = buildProbe({
    outDir: OUT,
    env: {
      PUBLIC_FORM_ENDPOINT: endpoint,
      PUBLIC_CONTACT_EMAIL: 'author@example.com',
      PUBLIC_CAL_URL: 'https://cal.com/probe/30min',
      // Umami 故意留空：读路径零客户端 JS，减少与本脚本无关的干扰
      PUBLIC_UMAMI_SCRIPT_URL: '',
      PUBLIC_UMAMI_WEBSITE_ID: '',
    },
  });
  if (!built.ok) {
    console.log('@@LEAD@@ ' + JSON.stringify({ verdict: 'FAIL', reason: 'probe build failed' }));
    console.error(built.output.slice(-3000));
    process.exitCode = 1;
  } else {
    httpServer.state.root = OUT;

    chrome = await launchChrome();
    const { send, evaluate, on } = chrome;
    on((msg) => {
      if (msg.method === 'Network.loadingFailed') {
        failedUrls.push(msg.params.errorText ?? 'unknown');
      }
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');

    const modes = [
      { mode: 'subscribe', path: '/subscribe/', email: TEST_EMAIL, source: 'site:subscribe' },
      { mode: 'contact', path: '/contact/', email: 'client@example.com', source: 'site:contact' },
    ];

    const results = [];
    for (const m of modes) {
      const before = posts.length;
      const reached = await navigate(send, evaluate, `${base}${m.path}`);
      if (!reached) throw new Error(`未能打开 ${m.path}`);

      // DoD ③：订阅页必须含同意来源、一键退订说明、隐私政策入口
      const pageText = await evaluate('document.body.innerText');
      const consentCopy = m.mode === 'subscribe'
        ? /同意来源/.test(pageText) && /退订/.test(pageText) && /privacy|隐私政策/.test(pageText)
        : true;

      // DoD ②：端点存在时，邮件兜底链接仍然在页面上
      const fallbackCount = await evaluate(
        `document.querySelectorAll('a[data-lead-fallback="${m.mode}"]').length`,
      );

      const fillState = await evaluate(`(() => {
        const form = document.querySelector('form[data-lead-form="${m.mode}"]');
        if (!form) return 'no-form';
        const set = (name, value) => {
          const el = form.querySelector('[name="' + name + '"]');
          if (!el) return false;
          if (el.type === 'checkbox') el.checked = value;
          else el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        };
        set('email', '${m.email}');
        set('consent', true);
        ${m.mode === 'contact' ? `set('name', '测试访客'); set('message', '想聊聊一个项目');` : ''}
        return form.checkValidity() ? 'valid' : 'invalid';
      })()`);

      if (fillState !== 'valid') {
        results.push({ mode: m.mode, error: `表单填写后仍 ${fillState}` });
        continue;
      }
      await evaluate(
        `document.querySelector('form[data-lead-form="${m.mode}"]').requestSubmit()`,
      );

      // 等端点收到 POST
      let got = null;
      for (let i = 0; i < 60 && posts.length === before; i++) await sleep(100);
      if (posts.length > before) got = posts[posts.length - 1];

      // 等浏览器渲染回执页
      let receipt = '';
      for (let i = 0; i < 40; i++) {
        receipt = await evaluate('document.title').catch(() => '');
        if (receipt === '已收到') break;
        await sleep(100);
      }

      let fields = {};
      if (got) {
        const p = new URLSearchParams(got.body);
        fields = Object.fromEntries(p.entries());
      }
      results.push({
        mode: m.mode,
        source: fields.source,
        consentSource: fields.consent_source,
        consent: fields.consent,
        email: fields.email,
        subject: fields._subject,
        honeypot: fields._gotcha ?? '',
        name: fields.name,
        message: fields.message,
        postUrl: got?.url,
        receipt,
        fallbackCount,
        consentCopy,
      });
    }

    const sub = results.find((r) => r.mode === 'subscribe') ?? {};
    const con = results.find((r) => r.mode === 'contact') ?? {};
    const checks = [
      [
        '订阅表单 POST 到端点且端点回执成功',
        sub.postUrl === '/lead' && sub.receipt === '已收到',
        `${sub.postUrl ?? '无'} / ${sub.receipt || '无回执'}`,
      ],
      [
        '订阅字段：邮箱 / 同意 / 来源留痕齐全',
        sub.email === TEST_EMAIL && sub.consent === 'yes' &&
          sub.source === 'site:subscribe' && sub.consentSource === 'subscribe',
        `email=${sub.email} consent=${sub.consent} source=${sub.source} consent_source=${sub.consentSource}`,
      ],
      [
        '蜜罐字段为空（真人未误填）',
        sub.honeypot === '',
        `"${sub.honeypot}"`,
      ],
      [
        '联系表单同样 POST 成功且带姓名/留言',
        con.postUrl === '/lead' && con.receipt === '已收到' &&
          con.name === '测试访客' && con.message === '想聊聊一个项目' &&
          con.source === 'site:contact',
        `name=${con.name} message=${con.message} source=${con.source}`,
      ],
      [
        'DoD ② 端点存在时邮件兜底仍在',
        sub.fallbackCount > 0 && con.fallbackCount > 0,
        `subscribe=${sub.fallbackCount} contact=${con.fallbackCount}`,
      ],
      [
        'DoD ③ 订阅页含同意来源/退订/隐私说明',
        sub.consentCopy === true,
        String(sub.consentCopy),
      ],
      [
        '无资源加载失败',
        failedUrls.length === 0,
        failedUrls.join('; ') || '0',
      ],
    ];

    console.log(
      'ⓘ 说明：脚本验证「提交被完整 POST 到端点 + 字段/来源留痕 + 浏览器收到回执」；' +
        '「作者收到邮件/通知」属外部送达，需配置真实端点后人工确认一次（M5 DoD ① 最终环节）。',
    );
    report(
      'LEAD',
      {
        results,
        externalDelivery: '需人工确认（不在脚本断言范围）',
        note: 'local capture endpoint, not the author real inbox',
      },
      checks,
    );
  }
} catch (err) {
  console.error(`[verify-lead] FAILED: ${err.stack ?? err.message}`);
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
