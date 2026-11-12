import { describe, it, expect } from 'vitest';
import {
  SITE,
  NAV,
  CTA,
  STAGE_LABEL,
  KIND_LABEL,
  FEATURED_LIMIT,
  RECENT_LOG_LIMIT,
  CAPABILITY_LIMIT,
  SOCIAL_LIMIT,
  COLLECTIONS,
  isPublicProd,
  formatDate,
} from '../src/lib/constants';

/** E6 首屏硬性预算：这些常量是"一目了然"的数字化契约，改动必须是有意的。 */
describe('E6 首屏预算常量', () => {
  it('NAV ≤ 5 项且每项有 label/href', () => {
    expect(NAV.length).toBeLessThanOrEqual(5);
    for (const item of NAV) {
      expect(typeof item.label).toBe('string');
      expect(item.href.startsWith('/')).toBe(true);
    }
  });

  it('CTA 分层：primary / secondary / soft 各 1，路径都是站内', () => {
    expect(Object.keys(CTA)).toEqual(['primary', 'secondary', 'soft']);
    for (const c of Object.values(CTA)) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.href.startsWith('/')).toBe(true);
    }
  });

  it('各类预算值固定（防止悄悄放宽）', () => {
    expect(FEATURED_LIMIT).toBe(3);
    expect(RECENT_LOG_LIMIT).toBe(3);
    expect(CAPABILITY_LIMIT).toBe(4);
    expect(SOCIAL_LIMIT).toBe(3);
  });

  it('集合名与站点元信息完整', () => {
    expect(SITE.locale).toBe('zh-CN');
    expect(SITE.defaultDescription.length).toBeGreaterThan(0);
    expect(Object.values(COLLECTIONS)).toEqual([
      'products', 'log', 'capabilities', 'cases', 'pages', 'profile',
    ]);
    expect(Object.keys(STAGE_LABEL)).toHaveLength(4);
    expect(Object.keys(KIND_LABEL)).toHaveLength(6);
  });
});

/** 5.3 草稿/私有过滤：生产必须拦住，开发必须放行（否则本地预览看不到草稿）。 */
describe('isPublicProd 内容可见性', () => {
  const entry = (status: string, visibility: string) => ({ data: { status, visibility } });

  it('生产：仅 published 且非 private 可见', () => {
    expect(isPublicProd(entry('published', 'public'), true)).toBe(true);
    expect(isPublicProd(entry('published', 'unlisted'), true)).toBe(true);
  });

  it('生产：draft / private / 其它 status 一律不可见', () => {
    expect(isPublicProd(entry('draft', 'public'), true)).toBe(false);
    expect(isPublicProd(entry('published', 'private'), true)).toBe(false);
    expect(isPublicProd(entry('archived', 'public'), true)).toBe(false);
  });

  it('开发：全部放行，便于本地预览草稿', () => {
    for (const e of [entry('draft', 'public'), entry('published', 'private')]) {
      expect(isPublicProd(e, false)).toBe(true);
    }
  });
});

describe('formatDate 日期本地化', () => {
  it('按 Asia/Shanghai 输出 zh-CN 年月日，不受字符串/Date 入参影响', () => {
    const a = formatDate(new Date('2026-11-12T00:00:00Z'));
    const b = formatDate('2026-11-12T00:00:00Z');
    expect(a).toBe(b);
    expect(a).toMatch(/2026/);
    expect(a).toMatch(/11/);
    expect(a).toMatch(/12/);
  });
});
