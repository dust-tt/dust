import { cn } from "@dust-tt/sparkle";

import { PublicWebsiteLogo } from "@app/components/home/LandingLayout";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";

interface PublicInteractiveContentHeaderProps {
  title: string;
}

export function PublicInteractiveContentHeader({
  title,
}: PublicInteractiveContentHeaderProps) {
  return (
    <AppLayoutTitle className="bg-gray-50 @container dark:bg-gray-900">
      <div className="flex h-full min-w-0 max-w-full items-center">
        {/* Logo - left side */}
        <div className="flex shrink-0 items-center">
          <PublicWebsiteLogo />
        </div>

        {/* Title - centered */}
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
      </div>
    </AppLayoutTitle>
  );
}
