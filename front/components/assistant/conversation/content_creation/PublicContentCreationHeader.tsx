import {
  ActionSlideshowIcon,
  Button,
  cn,
  FullscreenExitIcon,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

import { PublicWebsiteLogo } from "@app/components/home/LandingLayout";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";

interface PublicContentCreationHeaderProps {
  title: string;
  isFullScreen?: boolean;
  onFullScreenToggle?: () => void;
}

// Applying flex & justify-center to the title won't make it centered in the header
// since it has the logo on the left (and will soon have buttons on the right).
// To make it perfectly centered, we need to set the same flex basis for both the right and left
// elements.
// TODO(CONTENT_CREATION 2025-08-27): optimize the header for mobile views once we have buttons.
export function PublicContentCreationHeader({
  title,
  isFullScreen: externalIsFullScreen,
  onFullScreenToggle: externalOnFullScreenToggle,
}: PublicContentCreationHeaderProps) {
  const [internalIsFullScreen, setInternalIsFullScreen] = useState(false);

  // Use external state if provided, otherwise use internal state
  const isFullScreen = externalIsFullScreen ?? internalIsFullScreen;

  const enterFullScreen = useCallback(async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      } else if ((document.documentElement as any).webkitRequestFullscreen) {
        // Safari
        await (document.documentElement as any).webkitRequestFullscreen();
      } else if ((document.documentElement as any).msRequestFullscreen) {
        // IE/Edge
        await (document.documentElement as any).msRequestFullscreen();
      }
    } catch (error) {
      console.error("Error entering fullscreen:", error);
    }
  }, []);

  const exitFullScreen = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        // Safari
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        // IE/Edge
        await (document as any).msExitFullscreen();
      }
    } catch (error) {
      console.error("Error exiting fullscreen:", error);
    }
  }, []);

  const handleFullScreenToggle = useCallback(() => {
    if (externalOnFullScreenToggle) {
      externalOnFullScreenToggle();
    } else {
      if (isFullScreen) {
        void exitFullScreen();
      } else {
        void enterFullScreen();
      }
    }
  }, [
    isFullScreen,
    enterFullScreen,
    exitFullScreen,
    externalOnFullScreenToggle,
  ]);

  // Listen for fullscreen changes (only when using internal state)
  useEffect(() => {
    if (externalIsFullScreen !== undefined) {
      return; // Don't listen for changes when external state is provided
    }

    const handleFullScreenChange = () => {
      const isCurrentlyFullScreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement
      );
      setInternalIsFullScreen(isCurrentlyFullScreen);
    };

    // Add event listeners for different browsers
    document.addEventListener("fullscreenchange", handleFullScreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullScreenChange);
    document.addEventListener("msfullscreenchange", handleFullScreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullScreenChange);
      document.removeEventListener(
        "webkitfullscreenchange",
        handleFullScreenChange
      );
      document.removeEventListener(
        "msfullscreenchange",
        handleFullScreenChange
      );
    };
  }, [externalIsFullScreen]);

  // ESC key event listener to exit full screen mode
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isFullScreen) {
        void exitFullScreen();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullScreen, exitFullScreen]);

  return (
    <AppLayoutTitle className="h-12 bg-gray-50 @container dark:bg-gray-900">
      <div className="flex h-full min-w-0 max-w-full items-center">
        <div className="grow-1 flex shrink-0 items-center md:basis-60">
          <PublicWebsiteLogo size="small" />
        </div>

        <div className="flex flex-1 justify-center">
          <span
            className={cn(
              "min-w-0 truncate text-sm font-normal",
              "text-primary dark:text-primary-night"
            )}
          >
            {title}
          </span>
        </div>

        <div className="md:grow-1 flex shrink-0 items-center justify-end md:basis-60">
          <Button
            icon={isFullScreen ? FullscreenExitIcon : ActionSlideshowIcon}
            variant="ghost"
            size="xs"
            onClick={handleFullScreenToggle}
            tooltip={`${isFullScreen ? "Exit" : "Start"} presentation mode`}
          />
        </div>
      </div>
    </AppLayoutTitle>
  );
}
