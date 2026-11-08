import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Raster exports for Expo launchers. Keep the transparent brand masters intact.
const assets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../mobile/assets');
const mark = path.join(assets, 'brand/unframe-mark.png');
const background = '#F8F6F2';

async function square(filename, size, markSize, opaque) {
  const foreground = await sharp(mark).resize(markSize, markSize, { fit: 'contain', background: '#00000000' }).png().toBuffer();
  const image = sharp({ create: { width: size, height: size, channels: 4, background: opaque ? background : '#00000000' } })
    .composite([{ input: foreground, gravity: 'centre' }]);
  if (opaque) image.removeAlpha();
  await image.png().toFile(path.join(assets, filename));
}

await square('icon.png', 1024, 680, true);
// Keep the whole square mark inside Android's central circular safe area.
await square('adaptive-icon.png', 1024, 480, false);
await square('splash-icon.png', 1024, 440, false);
await square('favicon.png', 256, 208, true);
