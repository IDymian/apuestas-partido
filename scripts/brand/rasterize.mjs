// Convierte public/brand/icon.svg en los PNG de la PWA y el favicon.
// Uso (una sola vez, no es parte del build):
//   npm i --no-save sharp png-to-ico && node scripts/brand/rasterize.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const icon = readFileSync('public/brand/icon.svg');
const maskable = readFileSync('public/brand/icon-maskable.svg');
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

for (const s of sizes) {
  await sharp(maskable, { density: 600 }).resize(s, s).png().toFile(`public/icons/icon-${s}x${s}.png`);
}
await sharp(icon, { density: 600 }).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
await sharp(icon, { density: 600 }).resize(512, 512).png().toFile('public/brand/logo-512.png');

const fav = await Promise.all([16, 32, 48].map((s) => sharp(icon, { density: 300 }).resize(s, s).png().toBuffer()));
writeFileSync('public/favicon.ico', await pngToIco(fav));
console.log('íconos listos');
