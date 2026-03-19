import { getFaviconPath } from "@app/lib/utils";
import { useEffect } from "react";

const APPLE_TOUCH_ICON_SIZES = [
  undefined,
  "60x60",
  "76x76",
  "120x120",
  "152x152",
  "167x167",
  "180x180",
  "192x192",
  "228x228",
] as const;

/**
 * Sets up static <head> elements shared across app layouts:
 * favicon, apple-touch-icons, viewport and apple-mobile-web-app-title meta.
 *
 * These are set once on mount and never cleaned up (they should always be present).
 */
export function useAppHeadSetup() {
  useEffect(() => {
    const faviconPath = getFaviconPath();

    // Favicon
    appendLink({ rel: "icon", type: "image/png", href: faviconPath });

    // Apple touch icons
    for (const size of APPLE_TOUCH_ICON_SIZES) {
      const href = size
        ? `/static/AppIcon_${size.split("x")[0]}.png`
        : "/static/AppIcon.png";
      appendLink({
        rel: "apple-touch-icon",
        ...(size ? { sizes: size } : {}),
        href,
      });
    }

    // Meta tags
    appendMeta({ name: "apple-mobile-web-app-title", content: "Dust" });
    appendMeta({
      name: "viewport",
      content: "width=device-width, initial-scale=1, maximum-scale=1",
    });
  }, []);
}

function appendLink(attrs: Record<string, string>) {
  const el = document.createElement("link");
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  document.head.appendChild(el);
}

function appendMeta(attrs: Record<string, string>) {
  const el = document.createElement("meta");
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  document.head.appendChild(el);
}
