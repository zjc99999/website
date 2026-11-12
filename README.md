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
pnpm run quality      # ★ 主门禁：build + CSP 生成 + 全量非浏览器测试 + CI 链自检
pnpm run quality:browser  # ★ 浏览器门禁：E2E 全套 + Lighthouse + axe（需系统 Chrome）
pnpm test             # = check + test:rules + test:unit（不含浏览器用例的全量回归）
pnpm test:rules       # 三条构建期硬校验（E4-a/b/c）被违反时 build 必须失败
pnpm test:unit        # vitest 单测（常量/证据链/CSP 策略，24 项）
pnpm test:perf        # G2 真实浏览器实测：LCP/CLS/首屏 JS（Slow 4G + CPU×4）
pnpm test:search      # 真实浏览器验证 Pagefind 站内搜索能初始化并返回结果
pnpm test:lead        # M5 DoD ①②③：真实提交订阅/联系表单，校验字段与来源留痕、邮件兜底
pnpm test:nodynamic   # M5 DoD ④：拔掉全部动态层后，5 个页面仍完整可读（不变量实测）
pnpm test:pw          # Playwright 冒烟（首屏预算/导航/CTA/Feed/CSP 响应头）
pnpm test:e2e         # = test:perf + test:search + test:lead + test:nodynamic + test:pw
pnpm test:lh          # Lighthouse 13 四类分数（实测 100/100/100/100，门槛 95）
pnpm test:axe         # axe-core 5 个页面 a11y violations（实测 0）
pnpm test:csp         # 由产物生成严格 CSP → public/_headers + dist/_headers（含漂移检测）
pnpm verify:ci        # 检查 quality 链没漏脚本、ci.yml 完整、密钥未入库
pnpm serve            # 本地静态预览（会把 CSP 作为真实响应头发出，默认 4321）
pnpm pagefind         # 单独重建 dist/pagefind 索引
pnpm make:cover       # 重新生成示例占位封面（零依赖 Node 手写 PNG）
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
能力必须挂 `evidence_ids`（无证据的能力不允许发布）；证据 id 写 `"<集合名>/<条目 id>"`（如 `products/atelier`），
构建期会校验**目标真实存在**，指向不存在的条目会直接让 build 失败；案例必须 `consent: true`（未授权客户信息不公开）。

## 目录速查

| 路径 | 作用 |
| --- | --- |
| `src/content.config.ts` | Content Layer 集合定义与 Zod schema（★ Astro 7 新位置） |
| `src/content/` | 全部明文内容，唯一内容源 |
| `src/content/profile.json` | 首屏身份/价值主张的唯一数据源 |
| `src/pages/` | 路由与静态生成 |
| `src/components/` | Hero / ProductCard / LogTimeline / CapabilityList / CTA / Nav / Footer / SubscribeForm / StaticPage / Seo(M4) |
| `src/lib/` | constants（常量/过滤/日期）、evidence（构建期证据链解析）、queries（集中查询）、feeds（RSS/JSON Feed 共用取数）、config（公开构建期配置唯一读取点） |
| `src/pages/rss.xml.js`、`feed.json.js` | RSS 2.0（含全文 `content:encoded`）与 JSON Feed 1.1，共用 `getFeedItems()` |
| `scripts/cdp-harness.mjs` | 零依赖 CDP 测试工具箱（静态服务器 + Chrome headless + 探针构建 + 真实响应头），被回归脚本共用 |
| `scripts/{csp-policy,csp-check,audit-csp}.mjs` | 严格 CSP 纯函数 / 由 dist 生成并校验 `_headers` / 只读产物审计 |
| `scripts/{lh-check,axe-check}.mjs` | Lighthouse 13 四类分数、axe-core a11y 回归（复用 cdp-harness 的 Chrome 调试端口） |
| `scripts/{serve,verify-ci}.mjs` | 带 CSP 头的本地静态服务器 / CI 链完整性与密钥 hygiene 自检 |
| `tests/` | vitest 单测（`*.test.ts`）+ stub + Playwright E2E（`e2e/site.spec.ts`） |
| `.github/workflows/ci.yml` | verify → quality → browser → audit 四段串行门禁 |
| `.github/dependabot.yml` | 依赖更新报告（只提 PR、禁止自动合并；忽略 typescript 主版本升级） |
| `public/_headers` | 由 `test:csp` 生成的严格 CSP + 安全响应头（入库，部署平台直接消费） |
| `functions/api/` | R1 方案 A 留空；R1.5/B 方案才启用 |
| `scripts/` | 新建日志、周更汇总、全量导出、硬校验回归、性能/搜索/线索/不变量实测、封面生成 |
| `public/` | favicon、robots.txt、`_headers` |

## 配置

复制 `.env.example` 为 `.env` 并按需填写；**密钥绝不入库**。
`astro.config.mjs` 里的 `site` 目前是占位域名，部署前换成真实自定义域名——
它会一处驱动 canonical、sitemap、OG、RSS、JSON Feed，无需逐个改。

**图片**：作品 frontmatter 的 `cover` 用相对**内容文件**的路径（如
`../../assets/atelier-cover.png`），由 Astro 的 `image()` schema helper 解析成
`ImageMetadata`，构建期自动产出 WebP/AVIF 与 `srcset`，无需手动 import sharp。
可选字段一律省略整行，不要写空值。

**动态薄层（方案 A，零后端零密钥）**：`.env` 里全部是 `PUBLIC_` 前缀的**公开**值，
由 Vite 内联进静态产物，绝不放密钥。留空即不启用，站点不留死链：

| 变量 | 留空时的行为 |
| --- | --- |
| `PUBLIC_FORM_ENDPOINT` | 表单整块降级为 `mailto:` 邮件链接 |
| `PUBLIC_CONTACT_EMAIL` | 邮件兜底链接的收件人 |
| `PUBLIC_CAL_URL` | 不渲染预约入口 |
| `PUBLIC_UMAMI_SCRIPT_URL` + `PUBLIC_UMAMI_WEBSITE_ID` | **必须同时配置**才加载单脚本；留空则全站零客户端 JS |

`src/pages/privacy.astro` 的第三方脚本清单**由当前构建的实际配置生成**，不会出现「文案说启用了、产物里却没有」。
`/contact` 的预约外链只在你点击时跳转，本站不预加载第三方脚本。
`pnpm test:lead` / `test:nodynamic` 分别实测「提交能被端点完整接收」与「拔掉动态层后读路径仍完整」；
「作者真的收到邮件/通知」属外部送达，需 M7 配真实端点后人工确认一次。

**构建钩子**：`astro.config.mjs` 里的 `atelierPagefind` 集成在 `astro:build:done`
生成 `dist/pagefind/`，所以**不要**把 `build` 改成 `astro build && ...`——
E4 违规探针回归会因此被污染。`/search` 页已 `noindex` 并被 sitemap 的 `filter` 排除。

**质量门禁（M6）**：`pnpm run quality` = `build → test:csp → test（check + E4 三条 + 24 个单测）→ verify:ci`；
`pnpm run quality:browser` = 全部浏览器回归 + Lighthouse + axe。两条链与 `.github/workflows/ci.yml`
跑的是同一组脚本，CI 不另搞一套断言。注意 **`pnpm ci` 是 pnpm 内建命令**（clean-install），
不要用它跑本仓库的门禁，用 `pnpm run quality`。浏览器用例复用系统 Chrome
（`PW_CHROME` 可覆盖），安装依赖时设 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` 不下载浏览器。

**CSP（M6-e）**：`script-src` 只允许 `'self'` + 构建期算出的内联脚本 sha256 +
`'wasm-unsafe-eval'`（Pagefind WASM 需要），**不放 `unsafe-inline`**；`style-src` 因
Pagefind UI 运行时内联样式明确放开 `'unsafe-inline'`（记录在案的取舍）。
`/search` 是全站唯一内联可执行脚本，改动它必须重新跑 `pnpm test:csp` 更新哈希，
否则 CSP 会拦掉它。`scripts/serve.mjs` 与 Playwright 的 webServer 都会把 `_headers`
里的 CSP 作为**真实 HTTP 响应头**发出，测的是与托管平台一致的行为。

**故意破 schema 必红（CI DoD）**：`pnpm test:rules` 写入违规内容 → 断言 `astro build` 非 0 →
清理 → 再断言恢复 0；同时 `quality` 链含真实 `build`，因此把违规内容提交进仓库时
CI 也必然红。`pnpm verify:ci` 负责检查这条链本身没漏脚本、没把 `.env`/密钥带入库。

## 约束

- 首屏硬性预算：身份 1 句、价值主张 1 句、作品 ≤3、主 CTA 1、次 CTA 1、导航 ≤5。
- 性能预算：首屏 JS ≤50KB、LCP <1.5s、CLS <0.1、Lighthouse ≥95。
- 范围冻结：R1 不做 CMS / 评论库 / 搜索服务 / 邮件队列 / 分析后端 / 登录体系。
