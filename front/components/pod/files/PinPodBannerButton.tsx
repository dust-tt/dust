import { usePinPodBanner } from "@app/hooks/usePinPodBanner";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Pin02V2 } from "@dust-tt/sparkle";

interface PinPodBannerButtonProps {
  owner: LightWorkspaceType;
  spaceId: string;
  pinnedFramePath: string | null;
  isEditor: boolean;
  framePath: string | null;
  fileName?: string;
  hidden?: boolean;
}

export function PinPodBannerButton({
  owner,
  spaceId,
  pinnedFramePath,
  isEditor,
  framePath,
  fileName,
  hidden,
}: PinPodBannerButtonProps) {
  const isMobile = useIsMobile();
  const { togglePin, isPinned } = usePinPodBanner({
    owner,
    podId: spaceId,
    pinnedFramePath,
    isEditor,
  });

  if (hidden || !isEditor || !framePath) {
    return null;
  }

  const pinnedAsBanner = isPinned(framePath);

  return (
    <Button
      icon={Pin02V2}
      variant="ghost"
      label={isMobile ? undefined : pinnedAsBanner ? "Pinned" : "Pin"}
      tooltip={pinnedAsBanner ? "Unpin from Pod banner" : "Pin as Pod banner"}
      onClick={() =>
        void togglePin(framePath, {
          fileName,
        })
      }
    />
  );
}
