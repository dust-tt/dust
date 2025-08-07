import { cn, Spinner } from "@dust-tt/sparkle";
import React from "react";

import { useNavigationLoading } from "@app/components/sparkle/NavigationLoadingContext";

export function NavigationLoadingOverlay() {
  const { isLoading } = useNavigationLoading();

  if (!isLoading) {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute inset-0 z-50",
        "bg-background/80 backdrop-blur-sm",
        "dark:bg-background-night/80",
        "flex items-center justify-center"
      )}
    >
      <Spinner size="lg" />
    </div>
  );
}