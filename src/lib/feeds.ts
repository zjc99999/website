/**
 * Feed 数据层：RSS 2.0 与 JSON Feed 1.1 共用同一份条目，避免两处口径漂移。
 *
 * 依据 M4 实测：
 *  - glob() 集合条目自带 `rendered.html`（正文渲染后的 HTML），可直接作为
 *    RSS `<content:encoded>` / JSON Feed `content_html` 的全文，无需再 render()；
 *  - `body` 是原始 Markdown 文本，保留给 changelog / 导出用。
 *  - 走 queries.ts 的 isPublicProd，草稿与 private 内容不会进入 feed。
 */
import { getLogs, getProducts } from './queries';

export interface FeedItem {
  /** 稳定 id：`<集合名>/<条目 id>` */
  id: string;
  /** 站内路径，带尾斜杠（与 sitemap / canonical 口径一致） */
  url: string;
  title: string;
  summary: string;
  /** 正文 HTML（可能为空，例如将来只有 frontmatter 的条目） */
  content?: string;
  date: Date;
  tags: string[];
  kind: 'log' | 'product';
}

export async function getFeedItems(): Promise<FeedItem[]> {
  const [logs, products] = await Promise.all([getLogs(), getProducts()]);

  const logItems: FeedItem[] = logs.map((l) => ({
    id: `log/${l.id}`,
    url: `/log/${l.id}/`,
    title: l.data.title,
    summary: l.data.summary,
    content: l.rendered?.html,
    date: l.data.published_at,
    tags: l.data.tags,
    kind: 'log',
  }));

  const productItems: FeedItem[] = products.map((p) => ({
    id: `products/${p.id}`,
    url: `/products/${p.id}/`,
    title: p.data.title,
    summary: p.data.summary,
    content: p.rendered?.html,
    date: p.data.published_at,
    tags: p.data.tags ?? [],
    kind: 'product',
  }));

  return [...logItems, ...productItems].sort((a, b) => b.date.getTime() - a.date.getTime());
}
