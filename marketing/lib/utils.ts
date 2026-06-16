import { isDevelopment } from "@marketing/types/shared/env";

export function getFaviconPath(): string {
  return isDevelopment() ? "/static/local_favicon.png" : "/static/favicon.png";
}

export function classNames(...classes: (string | null | boolean)[]) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Formats a timestamp to a human-readable date string.
 * @param timestamp
 * @param version - "long" (default), "short", or "compact"
 *
 * long: September 23, 2025 at 3:37:32 PM
 * short: September 23, 2025
 * compactWithDay: Sep 23, 2025
 * compact: Sep, 2025
 *
 */
export function formatTimestampToFriendlyDate(
  timestamp: number,
  version: "long" | "short" | "compact" | "compactWithDay" = "long"
): string {
  const date = new Date(timestamp);

  switch (version) {
    case "compact":
      return date
        .toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        })
        .replace(" ", ", ");

    case "short":
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

    case "long":
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      });
    case "compactWithDay":
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
  }
}
