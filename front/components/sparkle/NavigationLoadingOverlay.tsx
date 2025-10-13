import { cn, Spinner } from "@dust-tt/sparkle";
import React from "react";

import { useNavigationLoading } from "@app/components/sparkle/NavigationLoadingContext";

export function NavigationLoadingOverlay() {
  const { isNavigating } = useNavigationLoading();

  if (!isNavigating) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute inset-0 z-50",
        "bg-background/80 backdrop-blur-sm",
        "dark:bg-background-night/80",
        "flex items-center justify-center",
        "animate-navigation-loader opacity-0"
      )}
    >
      <Spinner size="lg" />
    </div>
  );
}
