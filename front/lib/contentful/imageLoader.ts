import type { ImageLoaderProps } from "next/image";

export default function contentfulImageLoader({
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  // If it's a Contentful image, add the width and quality parameters
  if (src.includes("images.ctfassets.net")) {
    const url = new URL(src);
    url.searchParams.set("w", width.toString());
    if (quality) {
      url.searchParams.set("q", quality.toString());
    }
    url.searchParams.set("fm", "webp");
    return url.toString();
  }

  // For non-Contentful images, return as-is
  return src;
}
