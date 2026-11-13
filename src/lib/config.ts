/**
 * 公开构建期配置的唯一读取点（M5）。
 *
 * 约定：这里的键全部以 PUBLIC_ 开头 —— Vite 会把值**内联进静态产物**，
 * 因此只能放公开信息（端点 URL、站点 ID、预约外链），绝不放密钥。
 * 密钥（如 RESEND_API_KEY）只存在于部署平台环境变量，由 R1.5 的 Serverless 读取。
 *
 * 为什么集中到这里：隐私政策页据此生成「当前构建实际启用了哪些第三方服务」，
 * 避免文案与产物不一致（写了「没启用」但产物里其实有脚本）。改配置只改这一处。
 */
/**
 * M7：默认值为用户已确认的公开信息，保证「首次部署不做任何平台配置」也有可用的
 * 联系/预约路径；平台环境变量可覆盖（例如换邮箱、换预约链接）。
 * 唯一刻意留空的是表单端点 —— 它需要用户在 Cloudflare 后台配置并重新构建，
 * 且必须在 build 之前设好（见 docs/部署与回滚演练.md 的 CSP 顺序约束）。
 */
export const PUBLIC_CONFIG = {
  /** 方案 A 第三方表单端点：留空 → SubscribeForm 整块降级为 mailto: */
  formEndpoint: import.meta.env.PUBLIC_FORM_ENDPOINT || '',
  /** 邮件兜底收件人（公开） */
  contactEmail: import.meta.env.PUBLIC_CONTACT_EMAIL || 'zjc_9999@163.com',
  /** Cal.com 公开预约外链（Google 账户只是登录方式，本站不调 API、不嵌 widget） */
  calUrl: import.meta.env.PUBLIC_CAL_URL || 'https://cal.com/zjc-9999/30min',
  /** Umami 隐私友好分析：两项都配置才算启用 */
  umamiScriptUrl: import.meta.env.PUBLIC_UMAMI_SCRIPT_URL || '',
  umamiWebsiteId: import.meta.env.PUBLIC_UMAMI_WEBSITE_ID || '',
} as const;

/** 两个值必须同时存在，否则半配置状态会加载一个没有 website-id 的脚本 */
export const ANALYTICS_ENABLED = Boolean(
  PUBLIC_CONFIG.umamiScriptUrl && PUBLIC_CONFIG.umamiWebsiteId,
);
