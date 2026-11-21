---
title: 隐私分层的架构取舍
summary: 用功能分层而不是说明书来划定数据边界，让离线可用成为底线
category: 架构
statement: 能把隐私边界写进功能分层与默认开关，让敏感文件不出本机、离线场景不被云端能力绑架
status: published
visibility: public
published_at: 2026-11-21
tags: [架构, 隐私, 离线, huanming]
locale: zh-CN
evidence_ids:
  - products/huanming
  - log/2026-11-21-模板市场与隐私边界
  - log/2026-11-21-四种整理方式的分层取舍
---

本地页只读属性不发请求，联网页才把文件名或摘要发到用户自己配置的 API；模板市场默认关闭、先校验再落盘。用户选哪个页签，就等于选了哪条数据边界。
