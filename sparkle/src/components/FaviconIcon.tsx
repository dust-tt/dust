import { Globe01 } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { useCallback, useState } from "react";

const faviconVariants = cva("", {
  variants: {
    size: {
      sm: "w-3 h-3",
      md: "w-5 h-5",
      lg: "w-6 h-6",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

interface FaviconIconProps {
  /** Direct URL of the favicon image; takes precedence over websiteUrl. */
  faviconUrl?: string;
  /** Website URL whose domain is used to derive a favicon via Google's favicon service. */
  websiteUrl?: string;
  /** Icon size: "sm" (12px), "md" (20px), or "lg" (24px). */
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Displays a website's favicon, from faviconUrl when provided or derived from
 * websiteUrl's domain otherwise, falling back to a globe icon while loading
 * or on failure. Use it to represent external websites or links compactly.
 * @summary Website favicon with globe fallback.
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
      finalFaviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    } catch {
      // Invalid URL, fallback to icon
    }
  }

  // If no favicon URL or it failed to load, show fallback icon
  if (!finalFaviconUrl || hasError) {
    return <Globe01 className={className} />;
  }

  return (
    <div
      className={cn(
        "relative flex items-center justify-center",
        faviconVariants({ size }),
        className
      )}
    >
      <img
        src={finalFaviconUrl}
        alt="Website icon"
        className={cn("object-contain", faviconVariants({ size }))}
        onError={handleError}
        onLoad={handleLoad}
        style={{
          opacity: isLoading ? 0 : 1,
          transition: "opacity 0.2s ease-in-out",
        }}
      />
      {(isLoading || hasError) && (
        <Globe01
          className={cn(
            faviconVariants({ size }),
            isLoading ? "absolute inset-0" : "hidden"
          )}
        />
      )}
    </div>
  );
}
