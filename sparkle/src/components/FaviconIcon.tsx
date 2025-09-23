import { cva } from "class-variance-authority";
import React, { useCallback, useState } from "react";

import { GlobeAltIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

const faviconVariants = cva("", {
  variants: {
    size: {
      sm: "s-w-4 s-h-4",
      md: "s-w-5 s-h-5",
      lg: "s-w-6 s-h-6",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

interface FaviconIconProps {
  faviconUrl?: string;
  websiteUrl?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Component that displays a website favicon with fallback to GlobeAltIcon
 * If faviconUrl is provided, uses that. If websiteUrl is provided, generates favicon URL.
 * Falls back to GlobeAltIcon if favicon fails to load.
 */
export function FaviconIcon({
  faviconUrl,
  websiteUrl,
  size = "sm",
  className,
}: FaviconIconProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleError = useCallback(() => {
    setHasError(true);
    setIsLoading(false);
  }, []);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  // Determine favicon URL
  let finalFaviconUrl = faviconUrl;
  if (!finalFaviconUrl && websiteUrl) {
    try {
      const domain = new URL(websiteUrl).hostname;
      finalFaviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
    } catch {
      // Invalid URL, fallback to icon
    }
  }

  // If no favicon URL or it failed to load, show fallback icon
  if (!finalFaviconUrl || hasError) {
    return <GlobeAltIcon className={className} />;
  }

  return (
    <div
      className={cn(
        "s-relative s-flex s-items-center s-justify-center",
        faviconVariants({ size }),
        className
      )}
    >
      <img
        src={finalFaviconUrl}
        alt="Website icon"
        className={cn("s-object-contain", faviconVariants({ size }))}
        onError={handleError}
        onLoad={handleLoad}
        style={{
          opacity: isLoading ? 0 : 1,
          transition: "opacity 0.2s ease-in-out",
        }}
      />
      {(isLoading || hasError) && (
        <GlobeAltIcon
          className={cn(
            faviconVariants({ size }),
            isLoading ? "s-absolute s-inset-0" : "s-hidden"
          )}
        />
      )}
    </div>
  );
}
