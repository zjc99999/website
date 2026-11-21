---
title: 桌面客户端交付
summary: 从打包、签名到双后端授权，把 Python 桌面软件真正交付到用户机器上
category: 工程
statement: 能把 Python + PySide6 桌面工具打包成可分发客户端，并处理签名授权、模块兼容与灾备后端
status: published
visibility: public
published_at: 2026-11-21
tags: [工程, 打包, 授权, huanming]
locale: zh-CN
evidence_ids:
  - products/huanming
  - log/2026-11-21-给激活码做非对称签名
  - log/2026-11-21-打包版本地模型踩坑复盘
---

Ed25519 非对称签名让客户端只留公钥；Nuitka 打包下的模块名差异与图标缺失都有护栏用例兜底；Cloudflare Workers 与 Azure VM 双后端共用一把密钥，兼顾灾备与国内可达性。
