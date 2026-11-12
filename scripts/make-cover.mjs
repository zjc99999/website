#!/usr/bin/env node
/**
 * 生成一张占位封面图（M4 图片优化验证用）。零新增依赖：
 * 用 Node 画一张纯色 PNG（手写最小 PNG 编码），避免依赖外部环境。
 * 实际项目里封面应是真实截图/设计稿，这里只为验证 <Image> + sharp 管线。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/assets/atelier-cover.png');
const W = 1200, H = 630;

// RGB 像素缓冲，深灰底 + 几条水平网格线 + 一个边框
const px = Buffer.alloc(W * H * 3);
function set(x, y, r, g, b) {
  const i = (y * W + x) * 3;
  px[i] = r; px[i + 1] = g; px[i + 2] = b;
}
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const border = x > 58 && x < W - 58 && y > 58 && y < H - 58;
    const grid = y % 42 === 0;
    let c = [24, 24, 27];
    if (grid) c = [35, 35, 39];
    if (!border) c = [x < 60 || y < 60 || x > W - 60 || y > H - 60 ? [90, 90, 100] : c][0];
    set(x, y, ...c);
  }
}

// PNG 编码：IHDR + IDAT(deflate of scanlines with filter byte 0) + IEND
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of body) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  crc = (crc ^ 0xffffffff) >>> 0;
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc);
  return Buffer.concat([len, body, crcBuf]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 3 + 1)] = 0;
  px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, png);
console.log(`COVER_OK ${W}x${H} ${png.length} bytes -> ${OUT}`);
