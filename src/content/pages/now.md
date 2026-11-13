---
title: 近况
summary: 现在正在做的事
key: now
status: published
visibility: public
published_at: 2026-11-12
tags: []
locale: zh-CN
---

- 已把 Atelier 从「能被找到」推进到「能留下线索、能跟进」，现在「每次改动都有门禁」。
- 已完成：内容模型与 2 分钟写作流（M2）、完整前台（M3）、SEO / RSS / JSON Feed / 站内搜索 / 图片优化与性能实测（M4）、CTA 与线索闭环（M5）、质量门禁与 CI（M6）。
- M4 实测：LCP 972ms、CLS 0、首屏 JS 0KB；搜索输入「静态」返回 8 条结果。
- M5 实测：订阅与联系表单真实提交到端点且字段/来源留痕齐全；把表单、预约、统计全指向不可达域名后，首页/作品/日志（含中文 slug 详情）5 个页面仍完整可读。
- M6 实测：Lighthouse 四类分数 100/100/100/100、axe 5 个页面 0 violations、Playwright 7 条全过、24 个单测；故意写坏一条 schema 时构建必红（移除后恢复）；严格 CSP 作为真实响应头生效。
- M7 准备（不依赖账号的部分）已完成：把 CI 从「本机 Windows 专用路径」改成标准 GitHub Actions（ubuntu-latest + setup-node + pnpm + 跨平台 Chrome 定位），写了 `docs/部署与回滚演练.md` 清单与 `pnpm deploy:smoke` 冒烟；本地实测 11 页 / feed / sitemap / Pagefind / 真 CSP 头全通过。
- M7 真实配置已落代码：域名 `website.85138175.xyz` 驱动 canonical / sitemap / OG / RSS / JSON Feed；对外邮箱、微信号、Cal.com 预约链接已内置；微信号按纯文本展示不造死链；CSP 的首方 origin 与站点同步。本地两条质量链 + 冒烟全绿。
- M7-B：代码已首推到 `zjc99999/website`（走代理 3067），GitHub Actions 在 ubuntu-latest 托管 runner 上实跑——首个 run audit 的密钥检查因规则过宽假红，改为单一扫描引擎后第二个 run `43395389553` **4/4 全绿**；Lighthouse / axe / Playwright / 24 单测都在 CI 里真跑过。
- 远端冒烟发现一个诚实的问题：CF 报 "Deploy successful" 但发布的是**仓库源码而非 dist/**（真实项目域 `website-1tq.pages.dev`，`/package.json` 200、`/index.html` 404），根因是 CF 后台没配 Build command / 输出目录。已把精确后台操作清单写进 `docs/部署与回滚演练.md`。
- 尚未闭环：① CF 后台配 `pnpm build` + 输出目录 `dist` + `PNPM_VERSION=11.28.5` 并重新部署；② 自定义域名 `website.85138175.xyz` 的 CNAME/HTTPS；③ 远端 `deploy:smoke:remote` 全绿；④ 一次「发布→回滚→再发布」演练与国内/第三方实测；⑤ 作者真实收到通知（需真实 `PUBLIC_FORM_ENDPOINT` 人工确认一次）；⑥ 5 人 3 秒测试（需真人，留 M8）。
- 接下来：等 CF 后台构建配置生效后重跑远端冒烟，把「CI 全绿」与「线上产物正确」这两件事真正对齐。

这个页面按 `/now` 的惯例维护，内容短，改起来不费劲。
