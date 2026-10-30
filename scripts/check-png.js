import { statSync, readFileSync } from 'node:fs';

const sizeAuto = statSync('temp-auto.png').size;
const sizeVis = statSync('temp-visible.png').size;
console.log('auto size:', sizeAuto, 'visible size:', sizeVis);

// Let's decode the PNG data using zlib
import zlib from 'node:zlib';

function hasBluePixel(pngPath) {
  const buf = readFileSync(pngPath);
  // find IDAT chunks
  let pos = 8;
  const idatChunks = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IDAT') {
      idatChunks.push(buf.subarray(pos + 8, pos + 8 + len));
    }
    pos += 12 + len;
  }
  const decompressed = zlib.inflateSync(Buffer.concat(idatChunks));
  // 800 x 600, 4 bytes per pixel (RGBA) + 1 filter byte per line = 3201 bytes per line
  // Let's check around row 55-65, col 55-65
  // Row stride = 1 + 800 * 4 = 3201 bytes
  let foundBlue = false;
  for (let y = 40; y < 80; y++) {
    const rowOffset = y * 3201 + 1;
    for (let x = 40; x < 80; x++) {
      const pxOffset = rowOffset + x * 4;
      const r = decompressed[pxOffset];
      const g = decompressed[pxOffset + 1];
      const b = decompressed[pxOffset + 2];
      if (b > 200 && r < 50 && g < 50) {
        foundBlue = true;
        break;
      }
    }
  }
  return foundBlue;
}

console.log('temp-auto.png has blue pixel:', hasBluePixel('temp-auto.png'));
console.log('temp-visible.png has blue pixel:', hasBluePixel('temp-visible.png'));
