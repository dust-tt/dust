import { useCallback, useEffect, useRef } from "react";

interface UseFaviconBadgeOptions {
  badgeColor?: string;
  textColor?: string;
  size?: number;
  dotSize?: number;
}

export function useFaviconBadge(options: UseFaviconBadgeOptions = {}) {
  const {
    badgeColor = "#ff0000",
    textColor = "#ffffff",
    size = 128,
    dotSize = 52,
  } = options;

  const originalFaviconUrl = useRef<string | null>(null);
  const faviconElement = useRef<HTMLLinkElement | null>(null);

  // Store original favicon URL on mount
  useEffect(() => {
    const favicon = document.querySelector(
      "link[rel~='icon']"
    ) as HTMLLinkElement;

    if (favicon) {
      faviconElement.current = favicon;
      originalFaviconUrl.current = favicon.href;
    } else {
      // Create favicon element if it doesn't exist
      const newFavicon = document.createElement("link");
      newFavicon.rel = "icon";
      newFavicon.href = "/favicon.ico"; // Default fallback
      document.head.appendChild(newFavicon);
      faviconElement.current = newFavicon;
      originalFaviconUrl.current = newFavicon.href;
    }

    // Cleanup: restore original favicon on unmount
    return () => {
      if (faviconElement.current && originalFaviconUrl.current) {
        faviconElement.current.href = originalFaviconUrl.current;
      }
    };
  }, []);

  const setBadge = useCallback(
    (count?: number) => {
      if (!faviconElement.current || !originalFaviconUrl.current) {
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        // Draw original favicon
        ctx.drawImage(img, 0, 0, size, size);

        // Draw notification badge (top-right corner)
        const badgeRadius = size / 4;
        const badgeX = size - badgeRadius;
        const badgeY = badgeRadius;

        ctx.fillStyle = badgeColor;
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
        ctx.fill();

        // Add count text if provided
        if (count !== undefined && count > 0) {
          ctx.fillStyle = textColor;
          ctx.font = `bold ${size / 2}px Arial`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(count > 99 ? "99+" : String(count), badgeX, badgeY);
        }

        if (faviconElement.current) {
          faviconElement.current.href = canvas.toDataURL("image/png");
        }
      };

      img.onerror = () => {
        // If image fails to load, just draw a colored circle with count
        ctx.fillStyle = badgeColor;
        ctx.fillRect(0, 0, size, size);

        if (count !== undefined && count > 0) {
          ctx.fillStyle = textColor;
          ctx.font = `bold ${size / 2}px Arial`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(count > 99 ? "99+" : String(count), size / 2, size / 2);
        }

        if (faviconElement.current) {
          faviconElement.current.href = canvas.toDataURL("image/png");
        }
      };

      img.src = originalFaviconUrl.current;
    },
    [badgeColor, textColor, size]
  );

  const setDot = useCallback(() => {
    if (!faviconElement.current || !originalFaviconUrl.current) {
      return;
    }

    // Make canvas larger to accommodate the dot
    const canvasSize = size + dotSize;
    const canvas = document.createElement("canvas");
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      // Draw original favicon anchored to bottom-left
      // x = 0 (left edge), y = dotSize (pushed down to make room for dot)
      ctx.drawImage(img, 0, dotSize, size, size);

      // Position dot so its center is at the top-right corner of the image
      const dotX = size;
      const dotY = dotSize;

      // White border for better visibility
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotSize / 2 + 1.5, 0, 2 * Math.PI);
      ctx.fill();

      // Draw the actual dot
      ctx.fillStyle = badgeColor;
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotSize / 2, 0, 2 * Math.PI);
      ctx.fill();

      if (faviconElement.current) {
        faviconElement.current.href = canvas.toDataURL("image/png");
      }
    };

    img.onerror = () => {
      // Fallback: draw colored square anchored to bottom-left
      ctx.fillStyle = "#cccccc";
      ctx.fillRect(0, dotSize, size, size);

      // Still draw the dot
      const dotX = size;
      const dotY = dotSize;

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotSize / 2 + 1.5, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = badgeColor;
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotSize / 2, 0, 2 * Math.PI);
      ctx.fill();

      if (faviconElement.current) {
        faviconElement.current.href = canvas.toDataURL("image/png");
      }
    };

    img.src = originalFaviconUrl.current;
  }, [badgeColor, size, dotSize]);

  const clearBadge = useCallback(() => {
    if (faviconElement.current && originalFaviconUrl.current) {
      faviconElement.current.href = originalFaviconUrl.current;
    }
  }, []);

  return { setBadge, setDot, clearBadge };
}
