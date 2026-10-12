// Writes resized WebP variants of every raster image under public/static, one per width that
// next/image can request. lib/image_loader.ts points local images to these files, so the
// marketing server never resizes images at runtime.
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

import nextConfig from "../next.config.js";
import sharp from "sharp";

const PUBLIC_DIR = path.join(import.meta.dirname, "../public");
const SOURCE_DIR = path.join(PUBLIC_DIR, "static");
const VARIANTS_DIR = path.join(PUBLIC_DIR, "_variants");
const RASTER_IMAGE_REGEX = /\.(png|jpe?g|webp)$/i;
// Matches the default `quality` next/image passes to loaders.
const WEBP_QUALITY = 75;
// sharp already spreads each resize across cores; this only keeps them busy between images.
const CONCURRENT_IMAGES = 4;

const { deviceSizes, imageSizes } = nextConfig.images;
const widths = [...imageSizes, ...deviceSizes];

const entries = await readdir(SOURCE_DIR, {
  recursive: true,
  withFileTypes: true,
});
const images = entries
  .filter((e) => e.isFile() && RASTER_IMAGE_REGEX.test(e.name))
  .map((e) => path.join(e.parentPath, e.name));

async function writeVariants(imagePath) {
  // `src` as written in components, e.g. "/static/landing/foo.png".
  const src = "/" + path.relative(PUBLIC_DIR, imagePath);
  const image = sharp(imagePath);
  await mkdir(path.join(VARIANTS_DIR, src), { recursive: true });
  for (const width of widths) {
    // Must match the URL returned by lib/image_loader.ts. Widths larger than the original
    // re-encode it at its own size, so every requested width has a file.
    await image
      .clone()
      .rotate() // Applies EXIF orientation, which WebP output would otherwise drop.
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(path.join(VARIANTS_DIR, src, `${width}.webp`));
  }
}

await rm(VARIANTS_DIR, { recursive: true, force: true });
const queue = [...images];
await Promise.all(
  Array.from({ length: CONCURRENT_IMAGES }, async () => {
    while (queue.length > 0) {
      await writeVariants(queue.pop());
    }
  })
);
