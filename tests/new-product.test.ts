/**
 * 单测：new-product.mjs 的三个纯函数。
 *
 * 锁住的是「工具生成的 frontmatter 能被 Zod 接受」这条链路里最容易悄悄坏掉的部分：
 *  - 可选字段绝不能写出空值（YAML 里 `url:` 会被解析成 null，build 直接失败）；
 *  - 含冒号 / 引号 / 换行的用户文本不能把 frontmatter 撞坏；
 *  - 新建作品的 order 必须排在已有作品之后（否则首页精选顺序漂移）。
 * 真实构建期行为由「生成探针 + pnpm build」与 test:rules 覆盖，二者互补。
 */
import { describe, it, expect } from 'vitest';
import { slugify, nextOrder, buildProductMdx } from '../scripts/new-product.mjs';

const baseOpts = {
  title: '焕名',
  tagline: '把文件名整理清楚',
  summary: '一个批量重命名工具',
  stage: 'live',
  featured: true,
  order: 2,
  published_at: '2026-11-14',
  status: 'published',
  visibility: 'public',
  tags: ['桌面工具', 'Windows'],
  locale: 'zh-CN',
  slug: 'huanming',
  url: '',
  repo_url: '',
  cover: '',
  launch_date: '',
  updated_at: '',
};

/** 把 frontmatter 两行 --- 之间取出来 */
const frontmatter = (mdx: string) => mdx.split('---')[1];

describe('slugify', () => {
  it('保留中文、小写英文数字，空白与下划线压成连字符', () => {
    expect(slugify('  焕名 File Renamer  ')).toBe('焕名-file-renamer');
    expect(slugify('My_Cool_Project')).toBe('my-cool-project');
  });

  it('标点被丢弃（与 new-log.mjs 一致），重复连字符合并、首尾连字符去掉', () => {
    // 注意：只有空白/下划线会变成连字符分隔符；标点（/、!）是直接丢弃，
    // 所以 'A/B  C!!D' → 'ab-cd' 而不是 'a-b-c-d'。
    expect(slugify('A/B  C!!D')).toBe('ab-cd');
    expect(slugify('---hello---world---')).toBe('hello-world');
  });

  it('空输入或全标点时回退到 untitled，不产生空文件名', () => {
    expect(slugify('')).toBe('untitled');
    expect(slugify('！！！')).toBe('untitled');
  });
});

describe('nextOrder', () => {
  it('取所有已有作品 order 的最大值 +1', () => {
    expect(nextOrder(['order: 1', 'order: 7', 'order: 3'])).toBe(8);
  });

  it('没有任何已有作品时从 1 开始', () => {
    expect(nextOrder([])).toBe(1);
    expect(nextOrder(['title: 没有 order 字段'])).toBe(1);
  });

  it('只匹配行首的 order 标量，不误吃正文/注释里的数字', () => {
    expect(nextOrder(['order: 5', '# order: 99', '正文 order: 100'])).toBe(6);
  });
});

describe('buildProductMdx 合法 frontmatter', () => {
  const mdx = buildProductMdx(baseOpts);
  const fm = frontmatter(mdx);

  it('必填字段齐全且值正确', () => {
    expect(fm).toContain('title: "焕名"');
    expect(fm).toContain('stage: live');
    expect(fm).toContain('featured: true');
    expect(fm).toContain('order: 2');
    expect(fm).toContain('published_at: 2026-11-14');
    expect(fm).toContain('status: published');
    expect(fm).toContain('tags: ["桌面工具","Windows"]');
  });

  it('★ 可选字段没值就整行省略，绝不写空值', () => {
    for (const key of ['url:', 'repo_url:', 'cover:', 'launch_date:', 'updated_at:']) {
      expect(fm).not.toContain(key);
    }
    expect(fm).not.toMatch(/:\s*$/m); // 没有任何「键: 」后面空着一行的写法
  });

  it('含冒号 / 引号 / 换行的用户文本被包成合法 YAML 双引号标量', () => {
    const tricky = buildProductMdx({
      ...baseOpts,
      title: '版本 2.0: "焕名" 发布',
      tagline: 'a: b',
    });
    const tfm = frontmatter(tricky);
    expect(tfm).toContain(`title: ${JSON.stringify('版本 2.0: "焕名" 发布')}`);
    expect(tfm).toContain('tagline: "a: b"');
  });

  it('可选字段有值时写出，且 URL / 相对路径按原样保留', () => {
    const full = buildProductMdx({
      ...baseOpts,
      url: 'https://example.com/app',
      repo_url: 'https://github.com/me/app',
      cover: '../../assets/app.png',
      launch_date: '2026-01-02',
    });
    const ffm = frontmatter(full);
    expect(ffm).toContain('url: "https://example.com/app"');
    expect(ffm).toContain('repo_url: "https://github.com/me/app"');
    expect(ffm).toContain('cover: "../../assets/app.png"');
    expect(ffm).toContain('launch_date: 2026-01-02');
  });

  it('正文含三段结构，并在注释里给出 product_id 关联提示与发布命令', () => {
    expect(mdx).toContain('## 这是什么');
    expect(mdx).toContain('## 为什么做');
    expect(mdx).toContain('## 设计上的取舍');
    expect(mdx).toContain('product_id: huanming');
    expect(mdx).toContain('git push origin main');
  });

  // ★ 真实 astro build 探针抓到的坑：本工具产出 .mdx，MDX 不接受 HTML 注释
  // `<!-- -->`（报 mdx-jsx:unexpected-character），必须用 `{/* */}`。
  // 单测把这条约束锁死，避免有人「顺手改成 HTML 注释」让工具产物全都不能构建。
  it('★ 用 MDX 注释 {/* */}，绝不产生 HTML 注释 <!-- -->（否则 build 必红）', () => {
    expect(mdx).toContain('{/*');
    expect(mdx).toContain('*/}');
    expect(mdx).not.toContain('<!--');
    expect(mdx).not.toContain('-->');
  });

  it('★ 病态标题里的 */ 被转义，不会提前闭合 MDX 块注释', () => {
    const tricky = buildProductMdx({ ...baseOpts, title: '标题含 */ 闭合序列', slug: 'x*/y' });
    // 插值里的 */ 变成 * /，因此注释里不会出现能提前闭合的裸序列
    expect(tricky).not.toContain('product_id: x*/y');
    expect(tricky).not.toContain('添加作品 标题含 */ 闭合序列');
    expect(tricky).toContain('product_id: x* /y');
    expect(tricky).toContain('添加作品 标题含 * / 闭合序列');
    // 被插值「切断」的下文仍在注释里（说明块注释没被提前闭合）
    expect(tricky).toContain('本作品详情页底部就会自动列出');
    expect(tricky.trimEnd().endsWith('*/}')).toBe(true);
    // 3 个行内注释 + 1 个块注释 = 4 处合法闭合，没有多出来的
    expect(tricky.match(/\*\/\}/g) || []).toHaveLength(4);
  });
});
