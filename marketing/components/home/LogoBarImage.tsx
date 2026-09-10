// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { contentfulImageLoader } from "@marketing/lib/contentful/imageLoader";
import type { LogoBarLogo } from "@marketing/lib/logo_bars";
import { cn } from "@dust-tt/sparkle";
import Image from "next/image";

/**
 * Normalization applied to every customer logo.
 *
 * The repo's fallback SVGs are hand-flattened to a uniform gray, but logos
 * uploaded to Contentful arrive straight from a brand kit, in full color and
 * at arbitrary aspect ratios. `grayscale` plus a fixed-height box gets them
 * close; the caller supplies the height. Tune here to affect every bar.
 *
 * Caveat worth knowing: `grayscale` preserves luminance, so a very light
 * brand color still reads light (a yellow logo becomes a pale gray). Those
 * need a pre-flattened upload rather than a CSS fix.
 */
const LOGO_IMAGE_CLASSES = "h-auto w-auto object-contain grayscale";

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
