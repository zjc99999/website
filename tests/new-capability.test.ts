/**
 * 单测：new-capability.mjs 的纯函数。
 *
 * 锁住的是「工具生成的 frontmatter 能被 Zod 的 E4 校验接受」这条链路里最容易悄悄坏掉的部分：
 *  - evidence_id 必须是 "<集合名>/<id>" 且集合名在白名单内；
 *  - evidence_ids 至少一条、逗号分隔解析不能产生空项；
 *  - 含冒号 / 引号 / 换行的用户文本不能把 frontmatter 撞坏；
 *  - 用户文本一律写成合法 YAML 双引号标量。
 */
import { describe, it, expect } from 'vitest';
import { slugify, isValidEvidenceId, parseEvidenceIds, buildCapabilityMd } from '../scripts/new-capability.mjs';

const baseOpts = {
  title: '全栈交付',
  summary: '从概念到上线一个人跑完链路',
  category: '工程',
  statement: '能把一个产品从概念设计落到可维护的线上系统',
  status: 'published',
  visibility: 'public',
  published_at: '2026-11-21',
  tags: ['全栈', '交付'],
  locale: 'zh-CN',
  evidence_ids: ['products/atelier', 'log/2026-11-12-scaffold-works'],
};

/** 把 frontmatter 两行 --- 之间取出来 */
const frontmatter = (md: string) => md.split('---')[1];

describe('slugify', () => {
  it('保留中文与小写英文数字，空白/下划线压成连字符，标点丢弃', () => {
    expect(slugify('  全栈 交付 Full_Stack ')).toBe('全栈-交付-full-stack');
    expect(slugify('A/B  C!!D')).toBe('ab-cd');
  });

  it('空输入回退到 untitled', () => {
    expect(slugify('')).toBe('untitled');
    expect(slugify('！！！')).toBe('untitled');
  });
});

describe('isValidEvidenceId（E4 格式门）', () => {
  it('接受 5 个白名单集合的合法 id', () => {
    for (const id of ['products/atelier', 'log/x', 'cases/y', 'capabilities/z', 'pages/about']) {
      expect(isValidEvidenceId(id)).toBe(true);
    }
  });

  it('拒绝错误格式：无斜杠、空集合、空 id、集合不在白名单', () => {
    for (const id of ['atelier', '/x', 'products/', 'profile/me', 'products//x', '']) {
      expect(isValidEvidenceId(id)).toBe(false);
    }
  });
});

describe('parseEvidenceIds', () => {
  it('逗号分隔字符串去空项', () => {
    expect(parseEvidenceIds('products/atelier, log/x , ,')).toEqual(['products/atelier', 'log/x']);
  });

  it('数组原样去空项', () => {
    expect(parseEvidenceIds(['products/atelier', '', 'log/x'])).toEqual(['products/atelier', 'log/x']);
  });
});

describe('buildCapabilityMd 合法 frontmatter', () => {
  const md = buildCapabilityMd(baseOpts);
  const fm = frontmatter(md);

  it('必填字段齐全且值正确', () => {
    expect(fm).toContain('title: "全栈交付"');
    expect(fm).toContain('category: "工程"');
    expect(fm).toContain('statement: "能把一个产品从概念设计落到可维护的线上系统"');
    expect(fm).toContain('status: published');
    expect(fm).toContain('published_at: 2026-11-21');
    expect(fm).toContain('tags: ["全栈","交付"]');
  });

  it('evidence_ids 非空且每条是合法的 "<集合>/<id>" 项', () => {
    expect(fm).toContain('evidence_ids:');
    expect(fm).toContain('  - "products/atelier"');
    expect(fm).toContain('  - "log/2026-11-12-scaffold-works"');
    for (const id of baseOpts.evidence_ids) expect(isValidEvidenceId(id)).toBe(true);
  });

  it('★ 用户文本被包成合法 YAML 双引号标量（冒号/引号不破坏 frontmatter）', () => {
    const tricky = buildCapabilityMd({
      ...baseOpts,
      title: '版本 2.0: "交付" 能力',
      statement: 'a: b 说"你好"',
    });
    const tfm = frontmatter(tricky);
    expect(tfm).toContain(`title: ${JSON.stringify('版本 2.0: "交付" 能力')}`);
    expect(tfm).toContain(`statement: ${JSON.stringify('a: b 说"你好"')}`);
  });

  it('正文是 HTML 注释（capabilities 输出 .md，不是 .mdx）', () => {
    expect(md).toContain('<!--');
    expect(md).toContain('-->');
  });
});
