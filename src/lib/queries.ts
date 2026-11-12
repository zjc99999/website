/**
 * 内容查询层：集中所有 getCollection 过滤与排序，页面只负责渲染。
 * 统一套用 isPublicProd（生产排除 draft / private），避免每个页面各写一遍而漏掉。
 */
import { getCollection, getEntry } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import { isPublicProd } from './constants';

export async function getProducts() {
  return (await getCollection('products', isPublicProd)).sort((a, b) => a.data.order - b.data.order);
}

export async function getFeaturedProducts(limit = 3) {
  return (await getProducts()).filter((p) => p.data.featured).slice(0, limit);
}

export async function getLogs() {
  return (await getCollection('log', isPublicProd)).sort(
    (a, b) => b.data.published_at.getTime() - a.data.published_at.getTime(),
  );
}

export async function getCapabilities() {
  return (await getCollection('capabilities', isPublicProd)).sort((a, b) =>
    a.data.category.localeCompare(b.data.category, 'zh-CN'),
  );
}

export async function getCases() {
  return (await getCollection('cases', isPublicProd)).sort(
    (a, b) => b.data.published_at.getTime() - a.data.published_at.getTime(),
  );
}

/** 按 key 取静态页面内容（about / now / uses / services / pricing） */
export async function getPage(key: string) {
  const pages = await getCollection('pages', isPublicProd);
  return pages.find((p) => p.data.key === key);
}

/** 某个作品关联的全部日志（用于作品详情页「创作记录」区） */
export async function getLogsForProduct(productId: string) {
  const logs = await getLogs();
  return logs.filter((l) => {
    const ref = l.data.product_id;
    // reference() 存的是 {collection,id}；也可能写成裸字符串
    return ref && (typeof ref === 'string' ? ref === productId : ref.id === productId);
  });
}

/** 解析一条日志的关联日志（getEntries 的轻量替代，避免 reference 类型分叉） */
export async function getRelatedLogs(entry: CollectionEntry<'log'>) {
  const refs = entry.data.related_ids ?? [];
  const out: CollectionEntry<'log'>[] = [];
  for (const r of refs) {
    const id = typeof r === 'string' ? r : r.id;
    const found = await getEntry('log', id);
    if (found) out.push(found);
  }
  return out;
}
