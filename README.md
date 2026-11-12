# Atelier / 造物间

> 以作品为证据、以创作过程建立信任、以线索转化为闭环的成长型个人商业主页。
> 概念与依据见 [docs/产品分析与概要设计.md](docs/产品分析与概要设计.md)；
> 排期与执行见 [docs/项目设计与实现规划书.md](docs/项目设计与实现规划书.md)。

## 本仓库是什么

R1 阶段一个**先自用**的静态站：读路径全静态、写路径尽量为零。
内容与代码同仓、明文 Markdown/MDX，`git push` 即发布；即使表单/分析等动态层全部宕机，网站仍完整可读。

## 环境要求

- Node `>=22.23.4`（本机实测 `v24.21.0` 可用）
- pnpm `11.28.5`（`packageManager` 已锁定）
- 本仓库**精确锁定**依赖版本，禁止随意 `pnpm update`；尤其 TypeScript 必须停在 `6.0.3`（`@astrojs/check` 的 peer 只接受 `^5 || ^6`）。

## 常用命令

```bash
pnpm install          # 首次 / 换机器后
pnpm dev              # 本地预览 http://localhost:4321
pnpm build            # 产出 dist/ 纯静态
pnpm preview          # 预览构建产物
pnpm check            # astro check（TS 类型 + Astro 模板校验）
pnpm sync             # 生成 .astro/ 类型（内容集合变更后跑）
pnpm new:log          # 2 分钟新建一条创作日志（M2 起可用）
pnpm changelog        # 汇总最近 7 天已发布日志 → exports/ 周报草稿（--all 全部）
pnpm export:all       # 导出全量明文内容 + 订阅者 CSV 模板 → exports/
pnpm test:rules       # 验证两条构建期硬校验（E4）被违反时 build 必须失败（M2 起）
pnpm test             # Vitest（M6 起可用）
```

## 怎么加一条创作日志（M2 起）

```bash
pnpm new:log "给首页做了 3 秒测试"
# 终端里交互式选类型（build-log / decision / changelog / note / retro / now）
# 非交互 / CI / 脚本：pnpm new:log "标题" --kind=decision --summary="摘要"
# 生成 src/content/log/YYYY-MM-DD-slug.md，填完直接 git push
```

手工写也行：在 `src/content/log/` 新建 `.md`，frontmatter 至少含
`title`、`summary`、`kind`、`status`、`published_at`；
`workspace_id` / `owner_member_id` 有默认值（`atelier` / `me`），可不写，避免每次手写。
字段定义见 `src/content.config.ts`（schema 即文档）。构建期 Zod 校验会拦住不合规内容。
注意：**可选字段留空时直接省略整行**（写 `repo_url:` 空值会被 YAML 解析成 null 而报错）。

## 怎么加一个作品

在 `src/content/products/` 新建 `.mdx`，按同目录已有文件的 frontmatter 填写；
阶段字段是 `stage`（取 `idea | building | live | archived`，默认 `building`），
`featured: true` 才会进首页「精选作品 ≤3」。
能力必须挂 `evidence_ids`（无证据的能力不允许发布）；案例必须 `consent: true`（未授权客户信息不公开）。

## 目录速查

| 路径 | 作用 |
| --- | --- |
| `src/content.config.ts` | Content Layer 集合定义与 Zod schema（★ Astro 7 新位置） |
| `src/content/` | 全部明文内容，唯一内容源 |
| `src/content/profile.json` | 首屏身份/价值主张的唯一数据源 |
| `src/pages/` | 路由与静态生成 |
| `src/components/` | Hero / ProductCard / LogTimeline / CapabilityList / CTA / SubscribeForm / Seo |
| `src/lib/` | 打分、事件名、SEO、i18n 纯函数 |
| `functions/api/` | R1 方案 A 留空；R1.5/B 方案才启用 |
| `scripts/` | 新建日志、周更汇总、全量导出 |
| `public/` | favicon、robots.txt |

## 配置

复制 `.env.example` 为 `.env` 并按需填写；**密钥绝不入库**。
`astro.config.mjs` 里的 `site` 目前是占位域名，部署前换成真实自定义域名。

## 约束

- 首屏硬性预算：身份 1 句、价值主张 1 句、作品 ≤3、主 CTA 1、次 CTA 1、导航 ≤5。
- 性能预算：首屏 JS ≤50KB、LCP <1.5s、CLS <0.1、Lighthouse ≥95。
- 范围冻结：R1 不做 CMS / 评论库 / 搜索服务 / 邮件队列 / 分析后端 / 登录体系。
