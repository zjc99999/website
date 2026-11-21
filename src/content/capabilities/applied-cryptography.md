---
title: 密码工程的正确落地
summary: 用成熟原语、权威 KAT 和逐字节参数，把「算法对了」变成「跨端开得开、改不出来」
category: 工程
statement: 能把 Argon2id / AES-KW / HKDF / AEAD 等成熟原语参数化、钉死、并用权威测试向量证明实现没走样
status: published
visibility: public
published_at: 2026-11-21
tags: [密码学, Argon2id, KAT, mylock]
locale: zh-CN
evidence_ids:
  - products/mylock
  - log/2026-11-17-libsodium的parallelism陷阱
  - log/2026-11-16-跨端逐字节契约是怎么立起来的
---

## 主张：正确性不是「用了 AES」，而是「参数与字节都没跑偏」

密码工程里最危险的错觉，是以为选对了算法名就万事大吉。真正的失败几乎都发生在参数、编码和实现的缝隙里：同一套 Argon2id，parallelism 不同就是两个完全不同的派生值；同一份规范，u32 用大端还是小端、换行是 CRLF 还是 LF，跨端就整库打不开。

MyLock 的做法是三层护栏，把「我以为对」变成「能证明对」。

## 护栏一：把原语钉死成显式参数

- **KDF**：Argon2id m=65536 KiB、t=3、**p=4**、salt 16 B、tag 32 B；解锁前先校验参数范围（19456 ≤ m ≤ 1048576 等），越界在分配内存前就报 `E_FORMAT`，顺带挡住「把 m 填成 4 TiB 打爆内存」的攻击。
- **密钥包裹**：RFC 3394 AES-256-KW，把 Master(32 B) ‖ MAC_Key(32 B) 包成 72 B；domain-separated 的 HKDF-Expand 让两个 slot 互换时确定性失败。
- **内容与清单**：XChaCha20-Poly1305，1 MiB 分块、每块独立 24 B nonce、16 B tag；`versionMac = HMAC-SHA256(...)` 覆盖整个 meta 头防降级。

格式层刻意**不创新**——全是成熟范式的组合。创新在产品层，正确性靠的是把每个参数写死、写全。

## 护栏二：每个原语先过权威 KAT

落地实现之前，Python PoC 先拿权威测试向量逐个对齐：RFC 9106 §5.3（Argon2）、draft-xchacha §A.3.1、RFC 3394 §4.6、RFC 5869 A.1、RFC 4231。结果 26 PASS / 0 FAIL / 2 NOTE。这一步的价值在于：调试时你面对的不是「两边算出来不一样，不知道谁错」，而是「这一端和权威答案逐字节一致，那另一端就是错的」。

## 护栏三：一份测试向量守跨端一致

`test-vectors.json`（13,499 B，30 个派生输出 + 13 个负向向量）是唯一逐字节契约，`.gitattributes` 标 `-text` 禁止换行归一化以保护 SHA-256 锚。Windows / Rust 内核 / 恢复 CLI 已验收，Android 真机 30/30 derived、13/13 negative、指纹 `d45b8659…02fa`；三平台 CI 已配置。任何格式字节的改动都必须升 `format` 并重新冻结全部锚——「一处改算法，四处同改」。

## 踩过的坑，变成护栏本身

libsodium 的 `crypto_pwhash` 把 parallelism 硬编码成 1，产出的派生值和 p=4 完全不同（b6393f9d… vs ef99bda9…），跨端会直接 `E_AUTH_FAILED`。改用 RustCrypto 显式设 p=4，并加 `assert_ne(p4, p1)` 回归断言。还有 `argon2::Params::new(m, t, p, output)` 的参数顺序——编译器只查类型、查不出顺序写反，最后是从 `.crate` 源码里核实才定位。

这些坑的共同点是「本地测试全绿，只是绿在错误的分支上」。所以这份能力最终交付的，不是一个算法清单，而是一套让错误无处藏身的验证体系。看下面三条证据，就能核对每一句主张。
