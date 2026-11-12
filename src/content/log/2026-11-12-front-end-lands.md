---
title: 前台 15 个页面落地了
summary: 从占位首页到完整前台，顺手修正了一个关于证据链的错误假设
kind: build-log
status: published
visibility: public
published_at: 2026-11-12
tags: [工程, Astro, 决策]
locale: zh-CN
product_id: atelier
related_ids: [2026-11-12-scaffold-works, 2026-11-12-why-static-first]
---

今天把 M3 做完了：15 个静态页面、8 个组件、3 个 lib 模块，`pnpm build` / `check` / `test:rules` 全绿，全站 15 个页面都是零 `<script>`。

过程中有个值得记下的修正：规划书里原本假定 Astro 的 `reference()` 会校验「证据指向的条目是否真实存在」。写了个探针把 `product_id` 指向一个不存在的 id，`astro build` 居然照样通过——说明它只管类型，不管存在性。于是加了一层 `src/lib/evidence.ts`，在构建期逐条解析每条能力的 `evidence_ids`，目标不存在就直接抛错中断构建，并补了第三条自动化回归用例。

这件事的教训是：**「看起来被框架保证了」和「真的被保证了」之间，差一次故意写错的探针**。证据链是这个产品的立身之本，不能只靠约定。
