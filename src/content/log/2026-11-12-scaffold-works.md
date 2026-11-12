---
title: 脚手架跑通了
summary: Astro 7.4.11 空构建、类型检查、冻结锁文件全部通过
kind: build-log
status: published
visibility: public
published_at: 2026-11-12
tags: [工程, Astro]
locale: zh-CN
product_id: atelier
related_ids: [2026-11-12-why-static-first]
---

今天把最小工程立起来了：

- `pnpm install` → 295 个包，零 peer 冲突；
- `pnpm build` → `output: "static"`，`dist/index.html` 1554 B，零客户端 JS；
- `pnpm check` → 0 errors / 0 warnings / 0 hints；
- `--frozen-lockfile` → 可复现。

一个小坑：Astro 7 把 `compressHTML` 默认值从 `true` 改成了 `'jsx'`，会吞掉行内元素之间的空格。中文文案里行内链接多，显式设回 `true` 才稳。

另一个坑：TypeScript latest 已经到 7.0.2，但 `@astrojs/check` 的 peer 只接受 `^5 || ^6`，所以锁死 6.0.3，不跟 latest。
