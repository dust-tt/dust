import {
  ActionSlideshowIcon,
  Button,
  cn,
  FullscreenExitIcon,
} from "@dust-tt/sparkle";

import { PublicWebsiteLogo } from "@app/components/home/LandingLayout";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";

interface PublicContentCreationHeaderProps {
  title: string;
  isFullScreen: boolean;
  onFullScreenToggle: () => void;
}

// Applying flex & justify-center to the title won't make it centered in the header
// since it has the logo on the left (and will soon have buttons on the right).
// To make it perfectly centered, we need to set the same flex basis for both the right and left
// elements.
// TODO(CONTENT_CREATION 2025-08-27): optimize the header for mobile views once we have buttons.
export function PublicContentCreationHeader({
  title,
  isFullScreen,
  onFullScreenToggle,
}: PublicContentCreationHeaderProps) {
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
            onClick={onFullScreenToggle}
            tooltip={`${isFullScreen ? "Exit" : "Start"} presentation mode`}
          />
        </div>
      </div>
    </AppLayoutTitle>
  );
}
