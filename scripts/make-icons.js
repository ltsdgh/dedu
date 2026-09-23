// Generates all app icons from the master artwork (dedu_icon.png).
// The master has its own rounded "card" frame; stores apply their own mask,
// so we drop the frame and extend the card colour full-bleed.
//   node scripts/make-icons.js
const sharp = require('sharp');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'dedu_icon.png');
const out = p => path.join(ROOT, p);

// Rounded-rect SVG mask (white = keep).
const roundRect = (size, inset, radius, blur = 0) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
     <defs><filter id="f"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>
     <rect x="${inset}" y="${inset}" width="${size - 2 * inset}" height="${size - 2 * inset}"
           rx="${radius}" fill="#fff" ${blur ? 'filter="url(#f)"' : ''}/>
   </svg>`);

async function main() {
  const meta = await sharp(SRC).metadata();
  const S = meta.width; // square master

  // Card colour: median of a flat patch of the card near the top edge.
  const patch = await sharp(SRC)
    .extract({ left: Math.round(S * 0.45), top: Math.round(S * 0.04), width: Math.round(S * 0.1), height: Math.round(S * 0.02) })
    .raw().toBuffer({ resolveWithObject: true });
  const ch = [0, 1, 2].map(c => {
    const v = [];
    for (let i = c; i < patch.data.length; i += patch.info.channels) v.push(patch.data[i]);
    v.sort((a, b) => a - b);
    return v[v.length >> 1];
  });
  const bg = { r: ch[0], g: ch[1], b: ch[2] };

  // Art with the frame (rounded corners + edge shading) faded into the card colour.
  const mask = await sharp(roundRect(S, S * 0.065, S * 0.15, S * 0.012)).resize(S, S).png().toBuffer();
  const artAlpha = await sharp(SRC).ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png().toBuffer();

  // Full-bleed square with the art scaled to `scale` of the canvas.
  async function fullBleed(size, scale) {
    const inner = Math.round(size * scale);
    const art = await sharp(artAlpha).resize(inner, inner).toBuffer();
    return sharp({ create: { width: size, height: size, channels: 3, background: bg } })
      .composite([{ input: art, gravity: 'center' }])
      .flatten({ background: bg })
      .png();
  }

  // iOS / App Store: 1024, opaque, no pre-rounded corners.
  const IOS_SCALE = 1.0;
  await (await fullBleed(1024, IOS_SCALE)).toFile(out('resources/icon.png'));
  await (await fullBleed(1024, IOS_SCALE)).toFile(out('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
  await (await fullBleed(180, IOS_SCALE)).toFile(out('apple-touch-icon.png'));

  // Google Play listing icon: 512 full square (Play applies its own rounding).
  await (await fullBleed(512, IOS_SCALE)).toFile(out('store-assets/play-icon-512.png'));

  // PWA maskable: all content inside the 80% safe circle.
  await (await fullBleed(512, 0.74)).toFile(out('icon512-maskable.png'));

  // PWA "any": our own rounded shape on a transparent canvas.
  for (const size of [192, 512]) {
    const sq = await (await fullBleed(size, IOS_SCALE)).toBuffer();
    const m = await sharp(roundRect(size, 0, size * 0.2)).png().toBuffer();
    await sharp(sq).ensureAlpha()
      .composite([{ input: m, blend: 'dest-in' }])
      .png().toFile(out(`icon${size}.png`));
  }
  console.log('icons written; card colour', bg);
}

main().catch(e => { console.error(e); process.exit(1); });
