---
title: libsodium 的 parallelism 陷阱
summary: libsodium 的 crypto_pwhash 把 parallelism 硬编码成 1，产出的 Argon2id 口令派生值跟 p=4 完全不同——跨端会直接解锁失败
status: published
visibility: public
published_at: 2026-11-17
tags: [mylock, argon2, cryptography, pitfall, build-log]
kind: build-log
product_id: mylock
related_ids:
  - 2026-11-16-跨端逐字节契约是怎么立起来的
  - 2026-11-18-从python-poc到rust内核
locale: zh-CN
---

## 现象：两端都「对」，就是打不开

PoC 用 `argon2-cffi` 的低层接口精确复现 RFC 9106 §5.3 的 KAT，p=4 跑出来的 IKM 以 `b6393f9d…` 开头。等到 Rust 内核真正落地，发现另一条路——libsodium 的 `crypto_pwhash`——算出来是 `ef99bda9…`， unlocking 直接 `E_AUTH_FAILED`。

根因藏得很深：**libsodium 的 `crypto_pwhash` 把 parallelism 硬编码成 1**，API 上根本没有 p 这个参数。RFC 9106 的推荐参数恰恰是 p=4（两条路线的参数集本来就不一样）。表面看都是 Argon2id，实际派生值天差地别。

## 处理：显式参数 + 断言

- Rust 侧改用 RustCrypto 的 `argon2` crate，通过 `Params` **显式设 parallelism=4**，不依赖任何高层封装的默认值。
- 加了一条 `assert_ne(p4, p1)` 的测试，把「两个 parallelism 必须算出不同结果」变成回归护栏——谁哪天改回默认 p=1，测试立刻红。
- 顺手加了 KDF 参数的硬校验：解锁前先检查 `19456 ≤ m ≤ 1048576`、`2 ≤ t ≤ 10`、`1 ≤ p ≤ 16`，越界直接 `E_FORMAT`，而且**在分配内存之前**做。这挡住了「把 m 填成 4 TiB 让对面 OOM」的攻击。

## 配套的坑：参数顺序编译器抓不到

同一阶段还踩了一个更隐蔽的：`argon2::Params::new(m, t, p, output)` 的参数顺序，编译器只检查类型（四个都是整数），写反了照样编译通过，派生值整条链全错。最后是从 `.crate` 源码里核实顺序才定位。

这类 bug 的共同点是：**本地测试全绿，只是绿在错误的分支上**。所以 MyLock 才把逐字节 KAT 当成不可动摇的基线——不靠「我觉得参数对」，靠和权威向量逐字节比对。这也是为什么跨端一致性必须用同一份 `test-vectors.json`，而不是各端各自跑单元测试。
