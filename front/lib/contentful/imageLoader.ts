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
  url.searchParams.set("fm", "webp"); // Use WebP format for better compression
  url.searchParams.set("q", "75"); // Quality setting

  return url.toString();
}
