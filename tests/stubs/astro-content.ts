/**
 * `astro:content` 的测试替身（M6）。
 *
 * 仅供 vitest 解析 constants.ts / evidence.ts 的 import 用。
 * 真实构建期由 Astro 提供；这里用可替换的 Map 模拟 getEntry，
 * 让「证据目标不存在必须抛错」这类构建期契约能被单元测试覆盖。
 */
import { vi } from 'vitest';

export const getEntry = vi.fn(async (_collection: string, _id: string) => undefined as any);
export const getCollection = vi.fn(async (_name: string, _filter?: unknown) => [] as any[]);

/** 仅测试用：重设/注入条目 */
export const __setEntries = (map: Record<string, Record<string, any>>) => {
  getEntry.mockImplementation(async (collection: string, id: string) => map[collection]?.[id]);
};
export const __reset = () => {
  getEntry.mockReset();
  getEntry.mockImplementation(async () => undefined);
};

export type CollectionKey = 'products' | 'log' | 'capabilities' | 'cases' | 'pages' | 'profile';
