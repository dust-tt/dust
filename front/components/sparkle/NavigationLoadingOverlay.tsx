import { cn, Spinner } from "@dust-tt/sparkle";
import React, { useEffect, useState } from "react";

import { useNavigationLoading } from "@app/components/sparkle/NavigationLoadingContext";

export function NavigationLoadingOverlay() {
  const { isLoading } = useNavigationLoading();
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (isLoading) {
      // Show overlay after 500ms delay to prevent flicker
      timeoutId = setTimeout(() => {
        setShowOverlay(true);
      }, 500);
    } else {
      // Hide overlay immediately when loading stops
      setShowOverlay(false);
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isLoading]);

  if (!showOverlay) {
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
