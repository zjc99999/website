---
title: 为什么先做纯静态
summary: 把「读路径」与「写路径」拆开，是这次最关键的一个决定
kind: decision
status: published
visibility: public
published_at: 2026-11-12
tags: [架构, 决策]
locale: zh-CN
product_id: atelier
related_ids: []
---

独立开发者最怕的不是功能少，是运维把自己拖垮。

所以这次把系统切成两半：**读路径全静态**（Git 里的 MDX → 构建成 HTML → CDN），**写路径才动态**（订阅、联系表单）。这样一来：

- 没有数据库、没有会话、没有运行时依赖，部署就是传一堆 HTML；
- 第三方表单服务、邮件服务、分析服务即使全挂，访客照样能看完整个网站；
- 内容与代码同仓，`git push` 就是发布，版本史就是备份。

代价是「在线后台编辑」得等到真有第二个人要写内容时再做。这个代价现在完全付得起。
