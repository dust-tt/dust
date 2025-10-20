import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  cn,
  RocketIcon,
} from "@dust-tt/sparkle";

import { PublicWebsiteLogo } from "@app/components/home/LandingLayout";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import type { UserTypeWithWorkspaces } from "@app/types";

interface PublicInteractiveContentHeaderProps {
  title: string;
  user: UserTypeWithWorkspaces | null;
  conversationUrl: string | null;
}

// Applying flex & justify-center to the title won't make it centered in the header
// since it has the logo on the left (and will soon have buttons on the right).
// To make it perfectly centered, we need to set the same flex basis for both the right and left
// elements.
export function PublicInteractiveContentHeader({
  title,
  user,
  conversationUrl,
}: PublicInteractiveContentHeaderProps) {
  return (
    <AppLayoutTitle className="h-12 bg-gray-50 px-4 @container dark:bg-gray-900">
      <div className="flex h-full min-w-0 max-w-full items-center">
        <div className="grow-1 flex shrink-0 basis-12 items-center md:basis-60">
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

        <div className="grow-1 flex basis-12 justify-end md:basis-60">
          {!user && (
            <Button
              label="Try it yourself"
              href={`/home?utm_source=public-frames`}
              variant="outline"
              icon={RocketIcon}
              onClick={withTracking(TRACKING_AREAS.FRAMES, "sign_up")}
              className="hidden sm:flex"
            />
          )}
          {user && conversationUrl && (
            <Button
              label="Go to conversation"
              href={conversationUrl}
              variant="outline"
              icon={ChatBubbleBottomCenterTextIcon}
              className="hidden sm:flex"
            />
          )}
        </div>
      </div>
    </AppLayoutTitle>
  );
}
