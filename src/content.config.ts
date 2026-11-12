/**
 * Content Layer 配置（Astro 7：文件位于 src/content.config.ts，不是旧版 src/content/config.ts）
 *
 * 设计依据：docs/项目设计与实现规划书.md §5.2 / §5.3；
 * 业务语义源头：docs/产品分析与概要设计.md §5.3 数据模型。
 *
 * 硬约束（E4 / E5）：
 *  - capability.evidence_ids 必须非空且指向真实集合，否则构建期失败；
 *  - case_study.consent 必须严格为 true，否则构建期失败；
 *  - 所有集合都带 workspace_id / owner_member_id（R1 恒定单值，R3 无需迁移语义）。
 */
import { defineCollection, reference } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

// ---- 组织化字段：R1 起固定单值，用 default 保证手写内容也能构建 ----
const WORKSPACE = z.literal('atelier').default('atelier');
const OWNER = z.literal('me').default('me');

/** 可被证据指向的集合名（capability.evidence_ids 的格式约束） */
const EVIDENCE_COLLECTIONS = ['products', 'log', 'cases', 'capabilities', 'pages'] as const;

/** 所有集合共享的 frontmatter 字段（对齐概要设计 5.3 BaseContent） */
const base = {
  workspace_id: WORKSPACE,
  owner_member_id: OWNER,
  title: z.string().min(1, { error: 'title 不能为空' }),
  summary: z.string().min(1, { error: 'summary 不能为空' }),
  // 注：规划书/概要设计写的是 draft|scheduled|published，但 R1 无发布调度器，
  // scheduled 一旦写出就会在构建期被当成可发布内容，是一个静默陷阱。故 R1 收敛为
  // draft|published 两级：draft 由各页面 getCollection 过滤，不出现在生产产物里。
  // R2 引入真正的定时发布时再恢复 scheduled，并补一个构建期"未到时间不发布"的过滤。
  status: z.enum(['draft', 'published']).default('published'),
  visibility: z.enum(['public', 'unlisted', 'private']).default('public'),
  published_at: z.coerce.date(),
  updated_at: z.coerce.date().optional(),
  tags: z.array(z.string()).default([]),
  locale: z.enum(['zh-CN', 'en']).default('zh-CN'),
  seo: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      og: z.string().optional(),
    })
    .default({}),
};

const products = defineCollection({
  loader: glob({ base: './src/content/products', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    ...base,
    tagline: z.string().min(1, { error: 'tagline 不能为空' }),
    // 与 base.status（内容发布态）区分：这里是产品生命周期。
    // 规划书 §5.2 示意叫 status_product；实现改名为 stage，避免 frontmatter 里出现两个 status。
    stage: z.enum(['idea', 'building', 'live', 'archived']).default('building'),
    url: z.string().optional(),
    repo_url: z.string().optional(),
    cover: z.string().optional(),
    metrics: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
    launch_date: z.coerce.date().optional(),
    featured: z.boolean().default(false),
    order: z.number().default(0),
  }),
});

const log = defineCollection({
  loader: glob({ base: './src/content/log', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    ...base,
    kind: z.enum(['build-log', 'decision', 'changelog', 'note', 'retro', 'now']),
    product_id: reference('products').optional(),
    related_ids: z.array(reference('log')).default([]),
    reading_time: z.number().optional(),
  }),
});

const capabilities = defineCollection({
  loader: glob({ base: './src/content/capabilities', pattern: '**/*.{md,mdx}' }),
  // ★ E4 硬校验：无证据的能力不允许发布
  schema: z.object({
    ...base,
    category: z.string().min(1),
    statement: z.string().min(1),
    evidence_ids: z
      .array(z.string().min(1))
      .min(1, { error: 'capability 必须至少挂一条证据（evidence_ids 不能为空）' })
      .refine(
        (ids) =>
          ids.every((id) =>
            EVIDENCE_COLLECTIONS.some((c) => id.startsWith(`${c}/`) && id.length > c.length + 1),
          ),
        { error: 'evidence_ids 必须是 "<集合名>/<条目 id>" 格式，例如 "products/atelier"' },
      ),
  }),
});

const cases = defineCollection({
  loader: glob({ base: './src/content/cases', pattern: '**/*.{md,mdx}' }),
  // ★ E4 硬校验：未授权客户信息不公开
  schema: z.object({
    ...base,
    product_id: reference('products').optional(),
    client: z.string().optional(),
    problem: z.string().min(1),
    solution: z.string().min(1),
    outcome: z.record(z.string(), z.string()).default({}),
    testimonial: z.string().optional(),
    consent: z.literal(true, { error: 'case_study.consent 必须为 true（未授权客户信息不公开）' }),
    consent_at: z.coerce.date(),
  }),
});

const pages = defineCollection({
  loader: glob({ base: './src/content/pages', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    ...base,
    key: z.enum(['about', 'now', 'uses', 'services', 'pricing']),
  }),
});

/** 首屏唯一数据源。file() 要求 JSON 为数组且每条带唯一 id。 */
const profile = defineCollection({
  loader: file('./src/content/profile.json'),
  schema: z.object({
    id: z.string(),
    name: z.string(),
    headline: z.string(), // 首屏身份一句话
    value: z.string(), // 首屏价值主张一句话
    bio: z.string(),
    availability: z.string(),
    location: z.string().optional(),
    contact_channels: z
      .array(z.object({ label: z.string(), url: z.string() }))
      .default([]),
    socials: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
  }),
});

export const collections = { products, log, capabilities, cases, pages, profile };
