/**
 * M6-e 单测：CSP 策略是纯函数，必须能脱离构建产物独立验证。
 * 锁住的是「收紧了什么、按什么条件放开什么」，防止日后有人图省事改成
 * `script-src *` 或删掉 frame-ancestors。
 */
import { describe, it, expect } from 'vitest';
import { buildCsp } from '../scripts/csp-policy.mjs';

const directive = (csp: string, name: string) =>
  csp.split(';').find((d) => d.trim().startsWith(name))?.trim() ?? '';

describe('buildCsp 默认策略', () => {
  const csp = buildCsp();

  it('默认只信任本站，堵住常见的三类注入面', () => {
    expect(directive(csp, 'default-src')).toBe("default-src 'self'");
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'");
    expect(directive(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'");
  });

  it('script-src 不含 unsafe-inline，但保留 wasm-unsafe-eval（Pagefind WASM 需要）', () => {
    const s = directive(csp, 'script-src');
    expect(s).toContain("'self'");
    expect(s).toContain("'wasm-unsafe-eval'");
    expect(s).not.toContain('unsafe-inline');
  });

  it('style-src 明确放开 unsafe-inline（Pagefind UI 运行时注入样式，记录在案的取舍）', () => {
    expect(directive(csp, 'style-src')).toContain("'unsafe-inline'");
  });

  it('worker-src 允许 blob:（Pagefind 的 web worker）', () => {
    expect(directive(csp, 'worker-src')).toContain('blob:');
  });
});

describe('buildCsp 按产物输入收紧/放行', () => {
  it('内联脚本哈希被登记且去重', () => {
    const s = directive(buildCsp({ scriptHashes: ["'sha256-AAA'", "'sha256-BBB'", "'sha256-AAA'"] }), 'script-src');
    expect(s.match(/'sha256-/g)).toHaveLength(2);
    expect(s).toContain("'sha256-AAA'");
    expect(s).toContain("'sha256-BBB'");
  });

  it('第三方表单端点进入 form-action 与 connect-src，但不会进入 script-src', () => {
    const csp = buildCsp({
      formOrigins: ['https://form.example.com'],
      connectOrigins: ['https://form.example.com'],
    });
    expect(directive(csp, 'form-action')).toContain('https://form.example.com');
    expect(directive(csp, 'connect-src')).toContain('https://form.example.com');
    expect(directive(csp, 'script-src')).not.toContain('https://form.example.com');
  });

  it('外部脚本来源只进 script-src，不扩散到 default-src', () => {
    const csp = buildCsp({ scriptOrigins: ['https://umami.example.com'] });
    expect(directive(csp, 'script-src')).toContain('https://umami.example.com');
    expect(directive(csp, 'default-src')).toBe("default-src 'self'");
  });

  it('空值 / undefined 不产生多余空格或 undefined 字样', () => {
    const csp = buildCsp({ scriptHashes: [], formOrigins: [''], imgOrigins: undefined });
    expect(csp).not.toMatch(/undefined|\s{2,}/);
  });
});
