---
title: 从 Python PoC 到 Rust 内核
summary: PoC 不是写完就扔的草稿——它逼出了格式规范里三处自相矛盾，回写后才敢用 Rust 落地约 1570 行的 mylock-core 和 9 命令恢复 CLI
status: published
visibility: public
published_at: 2026-11-18
tags: [mylock, poc, rust, architecture, build-log]
kind: build-log
product_id: mylock
related_ids:
  - 2026-11-16-跨端逐字节契约是怎么立起来的
  - 2026-11-19-为什么放弃winfsp选回环webdav
locale: zh-CN
---

## PoC 是一次性脚手架，但价值不一次性

M1 阶段用 Python 3.12 写了 `mylock_poc.py`：纯一次性脚手架，不进产品代码。它跑通了完整链路——建库（含 0 字节对象）→ 整盘 copytree 复制 → 两阶段 verify → 用 p=4 + 域分离 + AES-KW + versionMac 全量开库 → export 还原出 `hello.txt`（37 B）和 `empty.bin`（0 B），结果 ALL PASS。

真正值钱的不是「PoC 能跑」，而是它**逼出了规范里的三处硬伤**：

1. `§3.3` 的「最短转义」规则和 `\u00XX` 在换行符 `\n` 上冲突；
2. `device_id` 一字两义——既是「当前设备身份」，又是「manifest 记录里的写入者溯源标签」；
3. FINDING-4/5 的字节级拼接方式、恢复槽的 KDF 输入没有冻结。

## 把矛盾回写进规范，再动手写内核

三处矛盾回写到 vault-format spec v1.1.1：新增 §2.1 逐字节钉死（u32 大端、jti ASCII、16 B 原始 id、32 B header、HKDF info、AAD 拼接顺序），并规定「改任何格式字节就要升 format、重新冻结全部锚」。同时做了一批架构校正：

- `versionMac` 从「解锁前」移到「解锁后」校验——原设计自相矛盾（没有口令怎么验 MAC）；
- manifest 的 AAD 不再绑 `versionMac`——否则改口令重算 MAC 会毁掉整库；
- 删掉名称 SIV（SIV 是 AES 模式，没有 XChaCha-SIV）与 BLAKE3 checksum（冗余、解锁前还读不到）；
- 派生结果不落盘，内存里用 `SecretVec` / `Zeroizing` 并 `mlock`、禁 core dump。

## 落地：一个内核，三处复用

`mylock-core`（lib.rs 约 1570 行）把这些规则变成唯一实现，外面挂 9 命令恢复 CLI 和桌面 / 移动两个壳。CLI 冒烟跑完 8 步：export 还原出 15 B 的 `top secret note`；`rotate-keys` 让 `key_epoch` 从 0 变 1；旧口令再试，得到 `E_AUTH_FAILED`。

规范、PoC、内核、测试向量四份东西的版本号必须联动——「一处改算法，四处同改」。这条纪律比任何单次修复都重要，因为格式层一个字节的漂移，换来的是跨端整库打不开。
