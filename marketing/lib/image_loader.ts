import { contentfulImageLoader } from "@marketing/lib/contentful/imageLoader";
import { isDevelopment } from "@marketing/types/shared/env";
import type { ImageLoaderProps } from "next/image";

const LOCAL_RASTER_IMAGE_REGEX = /^\/static\/.+\.(png|jpe?g|webp)$/i;

/**
 * @cc [owner:philipperolet,label:performance] variant-paths-match-generator
 * In a production build, the URL returned for a local raster image under `/static/` MUST be the
 * path `scripts/generate-image-variants.mjs` writes for that `src` and `width`.
 */
export default function imageLoader(props: ImageLoaderProps): string {
  const { src, width } = props;

  if (src.includes("images.ctfassets.net") && !src.endsWith(".svg")) {
    return contentfulImageLoader(props);
  }

  if (!LOCAL_RASTER_IMAGE_REGEX.test(src)) {
    return src;
  }

  if (isDevelopment()) {
    // Variants only exist after `npm run build`, so dev serves the original. The dev server
    // ignores the `w` query; it only stops next/image from warning that the loader ignores width.
    return `${src}?w=${width}`;
  }

  return `/_variants${src}/${width}.webp`;
}
