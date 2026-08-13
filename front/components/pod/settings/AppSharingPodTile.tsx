import { ConfirmContext } from "@app/components/Confirm";
import { PodSettingsOptionLabel } from "@app/components/pod/settings/PodSettingsOptionLabel";
import { useUpdatePodMetadata } from "@app/lib/swr/pods";
import type { RichSpaceType } from "@app/types/api/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import { Share01, SliderToggle, Tooltip } from "@dust-tt/sparkle";
import { useCallback, useContext, useState } from "react";

const APP_SHARING_DESCRIPTION =
  "Everyone in the workspace can use this Pod's apps: call its published functions and use its shared frames. They cannot see or change the Pod's files.";

const APP_SHARING_NON_EDITOR_TOOLTIP =
  "Only Pod editors can change app sharing.";

interface AppSharingPodTileProps {
  owner: LightWorkspaceType;
  pod: RichSpaceType;
}

export function AppSharingPodTile({ owner, pod }: AppSharingPodTileProps) {
  const confirm = useContext(ConfirmContext);
  const updatePodMetadata = useUpdatePodMetadata({
    owner,
    podId: pod.sId,
  });
  const [isUpdating, setIsUpdating] = useState(false);

  const isPodArchived = !!pod.archivedAt;
  const structurallyDisabled = isPodArchived || !pod.isEditor;
  const sliderDisabled = structurallyDisabled || isUpdating;

  const toggleTooltip = isPodArchived
    ? "This Pod is archived; settings cannot be changed."
    : !pod.isEditor
      ? APP_SHARING_NON_EDITOR_TOOLTIP
      : APP_SHARING_DESCRIPTION;

  const handleToggle = useCallback(async () => {
    if (structurallyDisabled) {
      return;
    }

    if (!pod.appSharingEnabled) {
      const confirmed = await confirm({
        title: "Share this Pod's apps with the workspace?",
        message:
          "All workspace members will be able to call this Pod's published functions and use its shared frames. They will not gain access to the Pod's files or settings.",
        validateVariant: "warning",
        validateLabel: "Enable app sharing",
        cancelLabel: "Cancel",
      });
      if (!confirmed) {
        return;
      }
    }

    setIsUpdating(true);
    try {
      await updatePodMetadata({ appSharingEnabled: !pod.appSharingEnabled });
    } finally {
      setIsUpdating(false);
    }
  }, [confirm, pod.appSharingEnabled, structurallyDisabled, updatePodMetadata]);

  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <PodSettingsOptionLabel
        icon={Share01}
        title="App sharing"
        description={APP_SHARING_DESCRIPTION}
      />
      <div className="flex shrink-0 items-center gap-2">
        {sliderDisabled && !isUpdating ? (
          <Tooltip
            label={toggleTooltip}
            trigger={
              <div>
                <SliderToggle
                  selected={pod.appSharingEnabled}
                  onClick={handleToggle}
                  disabled
                />
              </div>
            }
          />
        ) : (
          <SliderToggle
            selected={pod.appSharingEnabled}
            onClick={handleToggle}
            disabled={sliderDisabled}
          />
        )}
      </div>
    </div>
  );
}
