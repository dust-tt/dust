import { cn, Spinner } from "@dust-tt/sparkle";
import React from "react";

import { useNavigationLoading } from "@app/components/sparkle/NavigationLoadingContext";

export function NavigationLoadingOverlay() {
  const { isLoading } = useNavigationLoading();

  if (!isLoading) {
    return null;
  }

  return (
    <>
      <style>{`
        .navigation-loader {
          opacity: 0;
          animation: navigation-fade-in 0.2s ease-in-out 0.5s forwards;
        }
        @keyframes navigation-fade-in {
          to {
            opacity: 1;
          }
        }
      `}</style>
      <div
        className={cn(
          "absolute inset-0 z-50",
          "bg-background/80 backdrop-blur-sm", 
          "dark:bg-background-night/80",
          "flex items-center justify-center",
          "navigation-loader"
        )}
      >
        <Spinner size="lg" />
      </div>
    </>
  );
}
