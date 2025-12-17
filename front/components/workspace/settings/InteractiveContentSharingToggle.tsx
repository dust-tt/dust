import { ActionFrameIcon, ContextItem, SliderToggle } from "@dust-tt/sparkle";

import { useFrameSharingToggle } from "@app/hooks/useFrameSharingToggle";
import type { WorkspaceType } from "@app/types";

export function InteractiveContentSharingToggle({
  owner,
}: {
  owner: WorkspaceType;
}) {
  const { isEnabled, isChanging, doToggleInteractiveContentSharing } =
    useFrameSharingToggle({ owner });

  return (
    <ContextItem
      title="Public Frame sharing"
      subElement="Allow Frames to be shared publicly via links"
      visual={<ActionFrameIcon className="h-6 w-6" />}
      hasSeparatorIfLast={true}
      action={
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={doToggleInteractiveContentSharing}
        />
      }
    />
  );
}
