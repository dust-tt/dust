// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { contentfulImageLoader } from "@marketing/lib/contentful/imageLoader";
import type { LogoBarLogo } from "@marketing/lib/logo_bars";
import { cn } from "@dust-tt/sparkle";
import Image from "next/image";

/**
 * The box every customer logo is fitted into: 600x280, the aspect the repo's
 * hand-normalized SVGs were drawn against (600 wide, 240-300 tall).
 *
 * Callers size the box; the logo is scaled to fit *inside* it with its own
 * proportions intact, so a wide wordmark is bounded by the box's width and a
 * square mark by its height. Neither can out-grow the other, which is what
 * went wrong before: height was capped but width wasn't, so wordmarks were
 * squeezed by their column while squarer logos ran to the height ceiling and
 * rendered half again as tall.
 */
export const LOGO_BOX_ASPECT = "aspect-[15/7]";

/**
 * Normalization applied to every customer logo.
 *
 * The repo's fallback SVGs are hand-flattened to a uniform gray, but logos
 * uploaded to Contentful arrive straight from a brand kit, in full color and
 * at arbitrary aspect ratios. `grayscale` plus the box above gets them close.
 *
 * Two caveats no CSS can fix, both needing a better file:
 * - `grayscale` preserves luminance, so a very light brand color still reads
 *   light (a yellow logo becomes a pale gray).
 * - Padding baked into the SVG's own canvas still counts as part of the logo,
 *   so a tightly-cropped file reads larger than a padded one at the same box
 *   size.
 */
const LOGO_IMAGE_CLASSES = "h-full w-full object-contain grayscale";

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
