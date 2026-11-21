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

/** 时间线展示项：在 LogItem 基础上于构建期解析出所属作品标签 */
export type LogTimelineItem = {
  id: string;
  title: string;
  summary: string;
  kind: string;
  publishedAt: Date;
  /** 所属作品标签；无 product_id 的站点级日志标为「站点」（isSite=true） */
  project?: { label: string; isSite?: boolean };
};

/**
 * 把日志映射成时间线展示项，并解析每条日志的关联作品标签（构建期完成，零客户端 JS）。
 * 用于 /log 与首页这类「跨项目混合」的时间线，让读者一眼区分记录属于哪个作品；
 * 作品详情页不调用本函数（整页同属一个作品，标签冗余）。
 */
export async function getLogTimelineItems(logs: CollectionEntry<'log'>[]): Promise<LogTimelineItem[]> {
  return Promise.all(
    logs.map(async (l) => {
      const ref = l.data.product_id;
      const productId = ref && (typeof ref === 'string' ? ref : ref.id);
      let project: LogTimelineItem['project'] = { label: '站点', isSite: true };
      if (productId) {
        const p = await getEntry('products', productId);
        // 指向存在且可解析的作品才显示作品名；指向无效/不可见条目时回退为「站点」
        if (p) project = { label: p.data.title };
      }
      return {
        id: l.id,
        title: l.data.title,
        summary: l.data.summary,
        kind: l.data.kind,
        publishedAt: l.data.published_at,
        project,
      };
    }),
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
