---
title: 为什么放弃 WinFsp 选回环 WebDAV
summary: 透明加密文件夹的挂载层有三条路，选 loopback WebDAV 是一次许可、工程量与安全边界之间的清醒取舍，而不是「技术上最优」的选择
status: published
visibility: public
published_at: 2026-11-19
tags: [mylock, webdav, winfsp, licensing, decision]
kind: decision
product_id: mylock
related_ids:
  - 2026-11-18-从python-poc到rust内核
  - 2026-11-21-让错误码在映射盘符之前透传
locale: zh-CN
---

## 三条路

要把密文目录变成「可写的 OS 盘符」，桌面端大致有三条路：WinFsp / FUSE 这类用户态文件系统驱动、Dokany、以及 loopback WebDAV + `net use`。

MyLock 选了第三条：`mylock-serve` 在本机 `127.0.0.1:4918` 起一个 only-loopback 的 WebDAV 服务，GUI 通过 `net use Z:` 把它映射成盘符；写进 `Z:` 的数据由 `VaultFs`（`DavFileSystem` 7 个方法）转成加密写回。

## 为什么不是 WinFsp

- **许可干净**：WinFsp 是 GPL-3.0，其 FLOSS 例外逐字禁止与专有软件混用；商业许可 6000 USD / 3 年。Rust 绑定本身也是 GPL-3.0。Dokany 是 LGPLv3，但作为备选仍待法务判断。MyLock 第一方是 `MIT OR Apache-2.0`，混用强 copyleft 驱动会把整个分发策略拖进泥潭。
- **零驱动**：不装内核驱动，减少蓝屏风险、安装权限与兼容性负担。
- **拒绝在同步根目录挂载**：`is_sync_root` 检查直接拒绝把盘符映射到 Desktop / OneDrive / Dropbox 之类目录，避免和用户自己的云同步打起来——否则我们防的「合法采集者」又从后门进来了。

## 代价要认

这是**非驱动级**方案：没有逐请求认证，任何本机进程只要能访问那个挂载点，就能读写明文。它也不如 WinFsp 那样对应用透明（有些软件的原子写、文件锁语义对 WebDAV 支持不好）。

所以这里没有「最优解」，只有一个清晰的取舍：用一点功能完整性，换许可安全、零驱动和可维护性。写回策略也跟着定了——全量 copy-on-write：未变对象复用原密文、不重加密，每次写回重建整份 manifest（不是增量日志）。这套东西在 M5 的真机 e2e 里跑通了 `net use Z:` 成功、`Z` 盘读写正常、整盘复制 `PLAINTEXT_HITS=0`。

选型的价值不在于选对，在于**把为什么选、放弃了什么写下来**——半年后回来看，才知道哪些限制是设计决策，哪些才是 bug。
