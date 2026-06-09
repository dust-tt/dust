// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import type { ImageLoaderProps } from "next/image";

export function contentfulImageLoader({
  src,
  width,
}: ImageLoaderProps): string {
  if (!src.includes("images.ctfassets.net")) {
    return src;
  }

  const url = new URL(src);
  url.searchParams.set("w", width.toString());
  url.searchParams.set("fm", "webp");
  url.searchParams.set("q", "75");

  return url.toString();
}
