/**
 * Generates the extension PNG icons without any image dependency.
 * A minimal PNG encoder (8-bit RGBA, filter 0) is enough for flat icons.
 * Run with: npm run icons
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');
const SIZES = [16, 32, 48, 128];
const BG = [79, 70, 229]; // indigo
const FG = [255, 255, 255];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function encodePng(size, pixels) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Rounded square background with three "text lines", drawn on a pixel grid. */
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const radius = size * 0.24;
  const bars = [
    { top: 0.30, height: 0.085, left: 0.22, right: 0.78 },
    { top: 0.45, height: 0.085, left: 0.22, right: 0.78 },
    { top: 0.60, height: 0.085, left: 0.22, right: 0.58 },
  ];

  const set = (x, y, rgb, alpha) => {
    const i = (y * size + x) * 4;
    px[i] = rgb[0];
    px[i + 1] = rgb[1];
    px[i + 2] = rgb[2];
    px[i + 3] = alpha;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Distance to the rounded-rectangle corners; outside means transparent.
      const cx = Math.min(Math.max(x + 0.5, radius), size - radius);
      const cy = Math.min(Math.max(y + 0.5, radius), size - radius);
      const inside = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius;
      if (!inside) {
        set(x, y, BG, 0);
        continue;
      }
      const bar = bars.find(
        (b) =>
          y >= b.top * size &&
          y < (b.top + b.height) * size &&
          x >= b.left * size &&
          x < b.right * size,
      );
      set(x, y, bar ? FG : BG, 255);
    }
  }
  return px;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, encodePng(size, drawIcon(size)));
  console.log(`wrote ${file}`);
}
