/**
 * RSS 2.0 静态端点（M4）。构建期产出 dist/rss.xml。
 *
 * 依据（已核验 @astrojs/rss@4.0.19/dist/index.js 全文）：
 *  - `rss(options)` 返回 Promise<Response>，Astro 静态端点直接 return 即可；
 *  - `site` 必须绝对 URL，用 context.site（astro.config.mjs 配置），M7 换真实域名即自动生效；
 *  - `items[].content` → `<content:encoded>`（自动加 xmlns:content），这里用
 *    glob() 条目自带的 `rendered.html` 作为全文，无需二次 render()；
 *  - `link` 给相对路径时，库内 createCanonicalURL 会基于 site 拼成绝对 URL 并补尾斜杠；
 *  - `customData` 可塞 <language>zh-cn</language> 等 channel 级元素。
 *
 * 与 JSON Feed 共用 src/lib/feeds.ts 的 getFeedItems()，避免两处口径漂移；
 * 草稿/private 内容已被 isPublicProd 过滤。
 */
import rss from '@astrojs/rss';
import { getFeedItems } from '../lib/feeds';
import { SITE } from '../lib/constants';

export async function GET(context) {
  const items = await getFeedItems();
  return rss({
    title: SITE.name,
    description: SITE.defaultDescription,
    site: context.site,
    items: items.map((it) => ({
      title: it.title,
      link: it.url,
      pubDate: it.date,
      description: it.summary,
      content: it.content,
      categories: it.tags,
    })),
    customData: '<language>zh-cn</language>',
    trailingSlash: true,
  });
}
