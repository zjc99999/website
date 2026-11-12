/**
 * 证据链解析（M3 新增，替代规划书 §5.2 对 reference() 的错误假设）。
 *
 * 实测：Astro 7 的 reference() 只提供 TypeScript 类型与自动补全，
 * **不会在构建期校验目标条目是否存在**（写 product_id: does-not-exist-xyz
 * 仍 build 成功）。因此「能力必须挂在真实证据上」不能靠 reference()，
 * 而是在 capabilities 页面构建期用本模块解析每个 evidence_id：
 *   - 目标不存在 → throw → astro build 失败（把证据链真正变成构建期事实）；
 *   - 目标存在 → 返回可渲染的链接（标题 + href）。
 *
 * evidence_id 格式："<集合名>/<条目 id>"，集合名限定在 EVIDENCE_COLLECTIONS。
 */
import { getEntry } from 'astro:content';
import type { CollectionKey } from 'astro:content';

export const EVIDENCE_COLLECTIONS = [
  'products',
  'log',
  'cases',
  'capabilities',
  'pages',
] as const;

export type EvidenceCollection = (typeof EVIDENCE_COLLECTIONS)[number];

export interface Evidence {
  /** 证据条目的标题，用于链接文案 */
  label: string;
  /** 站内链接 */
  href: string;
  /** 原始 id，便于排查 */
  rawId: string;
}

const ROUTES: Record<EvidenceCollection, (id: string) => string> = {
  products: (id) => `/products/${id}`,
  log: (id) => `/log/${id}`,
  cases: (id) => `/cases/${id}`,
  capabilities: (id) => `/capabilities#${id}`,
  pages: (id) => `/${id}`,
};

const isEvidenceCollection = (s: string): s is EvidenceCollection =>
  (EVIDENCE_COLLECTIONS as readonly string[]).includes(s);

/** 仅这 5 个集合可作证据（排除 profile，因为它没有 title 字段） */
type EvidenceKey = Extract<CollectionKey, EvidenceCollection>;

/**
 * 解析单条证据。构建期调用（SSG），目标不存在时直接抛出以中断构建。
 */
export async function resolveEvidence(rawId: string): Promise<Evidence> {
  const slash = rawId.indexOf('/');
  const collection = slash > 0 ? rawId.slice(0, slash) : '';
  const id = slash > 0 ? rawId.slice(slash + 1) : '';

  if (!collection || !id || !isEvidenceCollection(collection)) {
    throw new Error(
      `[evidence] 证据 id 格式错误："${rawId}"，应为 "<集合名>/<条目 id>"，` +
        `集合名限于 ${EVIDENCE_COLLECTIONS.join(', ')}`,
    );
  }

  const entry = await getEntry(collection as EvidenceKey, id);
  if (!entry) {
    throw new Error(
      `[evidence] 证据目标不存在："${rawId}"。capability 的每条证据都必须指向真实内容条目。`,
    );
  }

  return {
    label: entry.data.title ?? id,
    href: ROUTES[collection](id),
    rawId,
  };
}

/** 批量解析，保持原顺序；任一失败即抛（构建期中断）。 */
export async function resolveEvidenceList(rawIds: string[]): Promise<Evidence[]> {
  const out: Evidence[] = [];
  for (const id of rawIds) out.push(await resolveEvidence(id));
  return out;
}
