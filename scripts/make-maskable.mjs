// One-off: a maskable icon for the PWA – the app icon on a solid brand background without
// rounded corners, so Android's icon masks (circle, squircle …) never show the launcher behind it.
// Run: node scripts/make-maskable.mjs   → static/icon-maskable-512.png
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const src = PNG.sync.read(readFileSync('static/icon-512.png'));
const out = new PNG({ width: src.width, height: src.height });
const brand = [0x4f, 0x46, 0xe5];
for (let i = 0; i < src.width * src.height; i++) {
	const a = src.data[i * 4 + 3] / 255;
	for (let c = 0; c < 3; c++) out.data[i * 4 + c] = Math.round(src.data[i * 4 + c] * a + brand[c] * (1 - a));
	out.data[i * 4 + 3] = 255;
}
writeFileSync('static/icon-maskable-512.png', PNG.sync.write(out));
console.log('written static/icon-maskable-512.png', src.width, 'px');
