/**
 * 全站常量：内容集合名、CTA 文案、导航项、社交外链预算。
 * 单一来源，便于 M3 逐项核对首屏预算（E6）与 M4 SEO。
 */
import type { CollectionKey } from 'astro:content';

export const SITE = {
  name: 'Atelier · 造物间',
  defaultTitle: 'Atelier · 造物间',
  defaultDescription: '以作品为证据、以创作过程建立信任的独立开发者主页',
  locale: 'zh-CN',
} as const;

/** 导航：≤5 项（E6） */
export const NAV: ReadonlyArray<{ label: string; href: string }> = [
  { label: '首页', href: '/' },
  { label: '作品', href: '/products' },
  { label: '创作日志', href: '/log' },
  { label: '能力', href: '/capabilities' },
  { label: '关于', href: '/about' },
];

/** CTA 分层：主 1 / 次 1 / 软 1（E6、5.3） */
export const CTA = {
  primary: { label: '聊聊你的项目', href: '/contact' },
  secondary: { label: '订阅更新', href: '/subscribe' },
  soft: { label: '查看作品与记录', href: '/products' },
} as const;

export const STAGE_LABEL: Record<string, string> = {
  idea: '想法中',
  building: '开发中',
  live: '已上线',
  archived: '已归档',
};

export const KIND_LABEL: Record<string, string> = {
  'build-log': '构建记录',
  decision: '决策',
  changelog: '变更',
  note: '随记',
  retro: '复盘',
  now: '近况',
};

/** 精选作品预算：≤3（E6） */
export const FEATURED_LIMIT = 3;
/** 首屏近期日志预算：≤3 */
export const RECENT_LOG_LIMIT = 3;
/** 能力概览预算：≤4 */
export const CAPABILITY_LIMIT = 4;
/** 社交外链预算：≤3，且只放页脚（E6） */
export const SOCIAL_LIMIT = 3;

/** 集合名常量，避免各处硬编码字符串 */
export const COLLECTIONS: Record<string, CollectionKey> = {
  products: 'products',
  log: 'log',
  capabilities: 'capabilities',
  cases: 'cases',
  pages: 'pages',
  profile: 'profile',
};

/**
 * 生产环境内容过滤：草稿与私有内容不出现在产物里（5.3）。
 * 用法：getCollection('log', isPublicProd) —— 注意返回布尔而非集合。
 */
export function isPublicProd({ data }: { data: { status: string; visibility: string } }) {
  return import.meta.env.PROD ? data.status === 'published' && data.visibility !== 'private' : true;
}

/** 日期本地化（zh-CN，5.7 i18n 骨架） */
export function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Shanghai',
  }).format(date);
}
