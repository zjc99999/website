import { describe, it, expect, beforeEach } from 'vitest';
import { __setEntries, __reset } from './stubs/astro-content';
import {
  EVIDENCE_COLLECTIONS,
  resolveEvidence,
  resolveEvidenceList,
} from '../src/lib/evidence';

/**
 * 证据链解析（M3）：规划书 §5.2 原以为 reference() 会做跨集合存在性校验，
 * 实测它只给类型/补全。所以「能力必须挂在真实证据上」这条硬约束
 * 由本模块在构建期抛错来保证（E4-c 回归）。这里覆盖纯逻辑部分。
 */
describe('证据链解析 resolveEvidence', () => {
  beforeEach(() => __reset());

  it('合法 id 解析出标题、站内链接与原始 id', async () => {
    __setEntries({ products: { atelier: { data: { title: '造物间' } } } });
    const e = await resolveEvidence('products/atelier');
    expect(e).toEqual({ label: '造物间', href: '/products/atelier', rawId: 'products/atelier' });
  });

  it('目标无 title 时回退用 id 作文案', async () => {
    __setEntries({ log: { '2026-11-12-x': { data: {} } } });
    const e = await resolveEvidence('log/2026-11-12-x');
    expect(e.label).toBe('2026-11-12-x');
    expect(e.href).toBe('/log/2026-11-12-x');
  });

  it('5 个集合各自映射到正确路由', async () => {
    expect(EVIDENCE_COLLECTIONS).toEqual(['products', 'log', 'cases', 'capabilities', 'pages']);
    __setEntries({
      products: { p: { data: { title: 'P' } } },
      log: { l: { data: { title: 'L' } } },
      cases: { c: { data: { title: 'C' } } },
      capabilities: { k: { data: { title: 'K' } } },
      pages: { a: { data: { title: 'A' } } },
    });
    expect((await resolveEvidence('products/p')).href).toBe('/products/p');
    expect((await resolveEvidence('log/l')).href).toBe('/log/l');
    expect((await resolveEvidence('cases/c')).href).toBe('/cases/c');
    expect((await resolveEvidence('capabilities/k')).href).toBe('/capabilities#k');
    expect((await resolveEvidence('pages/a')).href).toBe('/a');
  });

  it('目标不存在 → 抛出可诊断错误（构建期中断）', async () => {
    await expect(resolveEvidence('products/definitely-not-real')).rejects.toThrow(
      /\[evidence\] 证据目标不存在/,
    );
  });

  it('格式错误 / 集合名不在白名单 → 拒绝，含 profile 也不行', async () => {
    for (const bad of ['', 'nope', 'atelier', '/x', 'products/', 'profile/me', 'unknown/x']) {
      await expect(resolveEvidence(bad)).rejects.toThrow(/\[evidence\] 证据 id 格式错误/);
    }
  });
});

describe('resolveEvidenceList 批量保序、任一失败即抛', () => {
  beforeEach(() => __reset());

  it('按输入顺序返回，且与逐条解析一致', async () => {
    __setEntries({
      products: { p: { data: { title: 'P' } } },
      log: { l: { data: { title: 'L' } } },
    });
    const list = await resolveEvidenceList(['log/l', 'products/p', 'log/l']);
    expect(list.map((e) => e.href)).toEqual(['/log/l', '/products/p', '/log/l']);
    expect(list.map((e) => e.label)).toEqual(['L', 'P', 'L']);
  });

  it('空数组返回空', async () => {
    expect(await resolveEvidenceList([])).toEqual([]);
  });

  it('列表中有一条坏证据 → 整批失败', async () => {
    __setEntries({ products: { p: { data: { title: 'P' } } } });
    await expect(resolveEvidenceList(['products/p', 'products/missing'])).rejects.toThrow(
      /证据目标不存在/,
    );
  });
});
