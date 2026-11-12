/**
 * JSON Feed 1.1 静态端点（M4）。构建期产出 dist/feed.json。
 *
 * 说明：jsonfeed.org 官网本轮取数失败（跨域重定向 / fetch failed），故按
 * JSON Feed 1.1 已公开稳定的字段结构手写，不引入任何依赖、不读网络。
 * 字段：version / title / home_page_url / feed_url / description / language /
 * items[{ id, url, title, summary, content_html, date_published, tags }]。
 *
 * 与 /rss.xml 共用 getFeedItems()：同一份条目、同一排序、同一草稿过滤口径。
 * 所有 URL 用 context.site 拼成绝对地址（M7 换域名即自动生效）。
 */
import { getFeedItems } from '../lib/feeds';
import { SITE } from '../lib/constants';

export async function GET(context) {
  const site = context.site;
  const items = await getFeedItems();

  const feed = {
    version: 'https://jsonfeed.org/version/1.1',
    title: SITE.name,
    home_page_url: site.href,
    feed_url: new URL('/feed.json', site).href,
    description: SITE.defaultDescription,
    language: SITE.locale,
    items: items.map((it) => ({
      id: new URL(it.url, site).href,
      url: new URL(it.url, site).href,
      title: it.title,
      summary: it.summary,
      ...(it.content ? { content_html: it.content } : {}),
      date_published: it.date.toISOString(),
      tags: it.tags,
    })),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    headers: { 'Content-Type': 'application/feed+json; charset=utf-8' },
  });
}
