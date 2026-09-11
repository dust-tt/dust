// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { contentfulImageLoader } from "@marketing/lib/contentful/imageLoader";
import type { LogoBarLogo } from "@marketing/lib/logo_bars";
import { cn } from "@dust-tt/sparkle";
import Image from "next/image";

/**
 * Normalization applied to every customer logo.
 *
 * The logo is bounded by its container on both axes and scaled down to fit,
 * keeping its own proportions. Callers give the container an explicit height
 * and centre it; as long as that container is *flatter* than any real logo,
 * height is always the binding dimension and every logo — a 2.5:1 wordmark, a
 * square mark, a portrait one — renders at exactly the same height.
 *
 * That "flatter than any logo" part is the whole trick. An earlier attempt
 * used a 600x280 box, which sat in the middle of the logos' own ratios: wide
 * wordmarks were bounded by its width and square marks by its height, so the
 * square ones towered over the rest. Bounding both axes is not enough on its
 * own — the box has to be flat enough that width never binds first.
 *
 * Two caveats no CSS can fix, both needing a better file:
 * - `grayscale` preserves luminance, so a very light brand color still reads
 *   light (a yellow logo becomes a pale gray).
 * - Padding baked into the SVG's own canvas still counts as part of the logo,
 *   so a tightly-cropped file reads larger than a padded one at the same box
 *   size.
 */
const LOGO_IMAGE_CLASSES =
  "h-auto w-auto max-h-full max-w-full object-contain grayscale";

export function LogoBarImage({
  logo,
  alt,
  width,
  height,
  className,
}: {
  logo: LogoBarLogo;
  // Empty string for the duplicated half of a marquee, which is aria-hidden.
  alt?: string;
  width: number;
  height: number;
  className?: string;
}) {
  // next/image only auto-bypasses its optimizer for `.svg` when the default
  // loader is in play, and Contentful's Images API can't transform SVG at all
  // — so opt out explicitly and let the CDN serve the file as-is.
  const isSvg = logo.src.toLowerCase().endsWith(".svg");

  return (
    <Image
      alt={alt ?? logo.name}
      src={logo.src}
      width={logo.width ?? width}
      height={logo.height ?? height}
      className={cn(LOGO_IMAGE_CLASSES, className)}
      {...(isSvg ? { unoptimized: true } : { loader: contentfulImageLoader })}
    />
  );
}
