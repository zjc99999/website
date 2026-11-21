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

## 主张：源码全绿不算交付，产物跑通才算

Python + PySide6 桌面软件的开发态和交付态是两套世界：源码在解释器里跑，用户拿到的是打包后的单文件 EXE。桌面客户端交付能力，就是把「能跑的源码」变成「用户机器上能装、能激活、能离线用的产物」，并处理签名授权、打包兼容与灾备后端。

## 授权：从「能算出来」到「改不出来」

激活码从盐值派生（算法和盐值都在客户端，逆向即可自算）升级为 Ed25519 非对称签名：服务端私钥签名、客户端只留公钥验签，私钥永不下发。编码从 base64url 改成定长 132 字符的 base32，扛住激活码「仅字母数字 + 大写」的归一化；服务端 `LIMITS.code` 上限从 100 提到 200，避免超长码被截断后静默回退到盐值路径（表现为莫名其妙的 `not_in_ledger`）。

## 打包：同一份代码，两个模块名

开发时「本地模型」页一切正常，Nuitka 打出的单文件 EXE 里却报 `No module named 'api'`。根因是 4 处惰性导入写成顶层 `from api import client`：源码运行时 `api` 在路径上，Nuitka 编成包后模块名变成 `src.api`，`api` 反而找不到。

修法是兼容两种运行形态：

```python
try:
    from ..api import client
except ImportError:
    from api import client
```

但只改导入不够——下次谁再加一个顶层 `from api import ...`，坑会再踩。于是补了 `test_pack_manifest` 护栏，把「打包清单里不能有会踩命名空间差异的导入方式」固化成测试，让回归在 CI 阶段就红。顺手还处理了单文件 EXE 图标（`app_icon_path()` 上溯两级、`--include-data-files` 显式打进包）和 keygen 单文件化（34.8 MB）。

教训是通用的：**打包问题开发期不可见，只有产物能暴露**。「npm/pytest 全绿」不能作为交付标准，必须冷启动跑一次、每个页签点一遍、离线场景断网试一次。

## 出货验证与双后端灾备

1.1.0 出货前的全链验证：`APP_VERSION = "Version 1.1.0 (2026 Stable)"`，Nuitka onefile 的 `main.exe` 49.3 MB、portable zip 73.6 MB，`verify_dist.py` 173 条目全 PASS；冷启动 offscreen 存活 12 秒确认；单测 30 + 冒烟 26 + Node 契约 34 + license_auto 50 全绿。

授权服务走 Cloudflare Workers（主，`license.1995188.xyz`）与 Azure VM（备，`rename.1995188.xyz`）双后端，共用同一把 `LEASE_SECRET`，互为灾备也兼顾国内可达性。两个 CF Worker 的线上坑也说明「平台部署成功 ≠ 配置生效」：versions 模式下 `wrangler secret put` 只生成新版本、要用 `deploy --secrets-file` 才真发布；台账接口恒 403 是因为只传了 `pathname`、没带 query 里的 `admin_token`，修成 `path: url.pathname + url.search` 并把契约测试从 30 补到 34 才全过。

把产物、签名、后端都纳入验证，桌面软件才算真正交到用户手上。看下面三条证据，就能核对这条交付链。
