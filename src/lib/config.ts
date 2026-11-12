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
export const PUBLIC_CONFIG = {
  /** 方案 A 第三方表单端点：留空 → SubscribeForm 整块降级为 mailto: */
  formEndpoint: import.meta.env.PUBLIC_FORM_ENDPOINT ?? '',
  /** 邮件兜底收件人（公开） */
  contactEmail: import.meta.env.PUBLIC_CONTACT_EMAIL ?? '',
  /** Cal.com（或其他）预约外链；未配置则不渲染预约入口，不留死链 */
  calUrl: import.meta.env.PUBLIC_CAL_URL ?? '',
  /** Umami 隐私友好分析：两项都配置才算启用 */
  umamiScriptUrl: import.meta.env.PUBLIC_UMAMI_SCRIPT_URL ?? '',
  umamiWebsiteId: import.meta.env.PUBLIC_UMAMI_WEBSITE_ID ?? '',
} as const;

/** 两个值必须同时存在，否则半配置状态会加载一个没有 website-id 的脚本 */
export const ANALYTICS_ENABLED = Boolean(
  PUBLIC_CONFIG.umamiScriptUrl && PUBLIC_CONFIG.umamiWebsiteId,
);
