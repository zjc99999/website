---
title: 跨端一致性与系统交付
summary: 一份内核驱动多端、逐字节契约守一致、按许可与真实产物把关的交付能力
category: 工程
statement: 能用单份核心内核支撑桌面与移动多端，用逐字节向量守住跨端一致，并把许可证与真实产物纳入交付门禁
status: published
visibility: public
published_at: 2026-11-21
tags: [跨端, Rust, 交付, 门禁, mylock]
locale: zh-CN
evidence_ids:
  - products/mylock
  - log/2026-11-18-从python-poc到rust内核
  - log/2026-11-19-为什么放弃winfsp选回环webdav
  - log/2026-11-21-让错误码在映射盘符之前透传
---

## 主张：把「能跑」和「敢交付」分开看

跨端交付最容易出现两种假象：一是「我这边能跑」就当多端都能跑，二是「测试全绿」就当产物没问题。前者败给平台差异，后者败给打包现场。真正的交付能力，是把内核复用、逐字节一致、许可合规和产物验证串成一条链。

## 一份内核，多端复用

`mylock-core` 是唯一的密码学内核，同时供 Windows 桌面（Tauri + loopback WebDAV 映射盘符）与 Android（生物识别暗格）复用。演进路径是从 Python PoC 逐模块移植到 Rust：先把格式与算法用 Python 对齐权威向量，再把终态落到 Rust 内核与恢复 CLI，避免「边写边改格式」导致跨端对不上。内核单一，意味着一致性问题可以在一个地方被根治，而不是在两端各修一遍。

## 逐字节契约：让多端「算得一样」可证明

同一份 `test-vectors.json`（30 个派生输出 + 13 个负向向量，`.gitattributes` 标 `-text` 禁换行归一化以保护 SHA-256 锚）在 Windows / Rust 内核 / 恢复 CLI 与 Android 真机（Redmi / Android 12 / arm64）上逐字节对齐：30/30 derived、13/13 negative、指纹 `d45b8659…02fa`。任何格式字节的改动都必须升 `format` 并重新冻结全部锚——「一处改算法，四处同改」。这份向量把抽象的「算法正确」变成了可机器验收的跨端契约。

## 挂载层：按许可与体验做取舍

WinFsp 能提供更完整的驱动级文件系统，但它是 GPL-3.0（FLOSS 例外禁止与专有代码混用），商业授权约 6000 USD / 3 年。对一个本地优先、双许可（MIT OR Apache-2.0）的个人项目，这个代价不可接受。于是弃用 WinFsp，改用 loopback WebDAV（`127.0.0.1:4918` + `net use Z:`）：非驱动级、无逐请求认证、拒绝在同步根目录挂载——用一点点功能取舍换来许可干净和部署简单。

## 打包现场：把产物本身纳入验证

M5 阶段踩过两个「开发期不可见」的坑：sidecar 把子进程 stderr 用 `Stdio::null()` 吞掉，错误全消失——改成进程内 `build_handler` + `OnceLock<Runtime>`；打包漏拷 `WebView2Loader.dll`，源码测试却全绿——加 SHA256 断言 + `objdump` 导入表门禁，缺任何非系统 DLL 就 exit 4。挂载环节还做了 `net use` 自动映射单字母（防路径注入）与失败回滚，端到端验证 `net use Z:` 成功、`PLAINTEXT_HITS=0`。

这些护栏的共同点是：**测试绿不代表产物对**。所以交付标准不是「npm/pytest 全绿」，而是把真实产物跑一次、把导入表扫一遍、把错误码在映射盘符之前透传出来。看下面四条证据，就能核对这条主张。
