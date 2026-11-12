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
- 尚未闭环的三项：作者真实收到通知（需部署时配真实端点人工确认一次）、5 人 3 秒测试（需真人，与真实内容一起做）、GitHub Actions 在托管 runner 上的首次实跑。
- 接下来：真正部署（M7）——需要域名、联系邮箱/微信、GitHub 远端仓库与部署平台账号；拿到后按演练文档做一次「发布→回滚→再发布」。

这个页面按 `/now` 的惯例维护，内容短，改起来不费劲。
