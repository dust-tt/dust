import { getBaseUrl } from "@app/lib/api/config";
import { clientFetch } from "@app/lib/egress/client";
import type { SparkleContextImageType } from "@dust-tt/sparkle";
import { forwardRef, type ImgHTMLAttributes, useEffect, useState } from "react";

/**
 * Check whether a URL points to our own API and therefore needs an
 * Authorization header. Matches relative `/api/…` paths and absolute URLs
 * whose origin equals the configured base URL (region-aware).
 */
function isDustApiUrl(url: string): boolean {
  if (url.startsWith("/api/")) {
    return true;
  }

  const baseUrl = getBaseUrl();
  if (baseUrl && url.startsWith(baseUrl)) {
    return true;
  }

  return false;
}

/**
 * Image component for the extension that fetches images with the Authorization
 * header (Bearer token) when the src points to our API.
 * External images and data:/blob: URLs are rendered with a plain <img>.
 *
 * Uses clientFetch which already injects auth headers via the defaultInitResolver.
 * Manages its own loading/error state internally so that parent components
 * (ImagePreview, ImageZoomDialog) don't need any changes.
 */
export const AuthenticatedImage: SparkleContextImageType = forwardRef<
  HTMLImageElement,
  ImgHTMLAttributes<HTMLImageElement>
>(function AuthenticatedImage({ src, ...props }, ref) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const needsAuth = !!src && isDustApiUrl(src);

  useEffect(() => {
    if (!src || !needsAuth) {
      setBlobUrl(null);
      setError(false);
      return;
    }

    let revoked = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const res = await clientFetch(src);
        if (revoked) {
          return;
        }

        if (!res.ok) {
          setError(true);
          return;
        }

        const blob = await res.blob();
        if (revoked) {
          return;
        }

        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        setError(false);
      } catch {
        if (!revoked) {
          setError(true);
        }
      }
    })();

    return () => {
      revoked = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src, needsAuth]);

  // For non-API URLs (external images, data:, blob:), render a plain img.
  if (!needsAuth) {
    return <img ref={ref} src={src} {...props} />;
  }

  // While fetching or on error, render an img without src so the layout is preserved.
  if (!blobUrl || error) {
    return <img ref={ref} {...props} />;
  }

  return <img ref={ref} src={blobUrl} {...props} />;
});
