// One-off: the small status-bar icon for push notifications on Android. Android uses only the
// alpha channel of the badge and paints the shape white, so the app icon (a filled square) would
// show as a white block. This takes the white glyph out of icon-512.png as a 96×96 silhouette.
// Run: node scripts/make-badge.mjs   → static/badge-96.png
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const src = PNG.sync.read(readFileSync('static/icon-512.png'));
const SIZE = 96;
const out = new PNG({ width: SIZE, height: SIZE });
const scale = src.width / SIZE;
// whiteness of a source pixel: the red channel runs from 79 (brand indigo) to 255 (white)
const white = (x, y) => {
	const i = (y * src.width + x) * 4;
	if (src.data[i + 3] === 0) return 0;
	return Math.max(0, Math.min(1, (src.data[i] - 79) / (255 - 79)));
};
for (let y = 0; y < SIZE; y++)
	for (let x = 0; x < SIZE; x++) {
		let sum = 0, n = 0;
		for (let sy = Math.floor(y * scale); sy < Math.floor((y + 1) * scale); sy++)
			for (let sx = Math.floor(x * scale); sx < Math.floor((x + 1) * scale); sx++) { sum += white(sx, sy); n++; }
		const i = (y * SIZE + x) * 4;
		out.data[i] = out.data[i + 1] = out.data[i + 2] = 255;
		out.data[i + 3] = Math.round((sum / n) * 255);
	}
writeFileSync('static/badge-96.png', PNG.sync.write(out));
console.log('written static/badge-96.png');
