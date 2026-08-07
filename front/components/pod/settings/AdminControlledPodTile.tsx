import { ConfirmContext } from "@app/components/Confirm";
import { PodSettingsOptionLabel } from "@app/components/pod/settings/PodSettingsOptionLabel";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useUpdatePodMetadata } from "@app/lib/swr/pods";
import type { RichSpaceType } from "@app/types/api/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import { Lock01, SliderToggle, Tooltip } from "@dust-tt/sparkle";
import { useCallback, useContext, useState } from "react";

const ADMIN_CONTROLLED_DESCRIPTION =
  "Workspace admins control membership and can attach connected data sources to this Pod.";

const ADMIN_CONTROLLED_NON_ADMIN_TOOLTIP =
  "Only workspace admins can change admin-controlled mode.";

interface AdminControlledPodTileProps {
  owner: LightWorkspaceType;
  pod: RichSpaceType;
}

export function AdminControlledPodTile({
  owner,
  pod,
}: AdminControlledPodTileProps) {
  const confirm = useContext(ConfirmContext);
  const { isAdmin } = useAuth();
  const updatePodMetadata = useUpdatePodMetadata({
    owner,
    podId: pod.sId,
  });
  const [isUpdating, setIsUpdating] = useState(false);

  const isPodArchived = !!pod.archivedAt;
  const structurallyDisabled = isPodArchived || !isAdmin;
  const sliderDisabled = structurallyDisabled || isUpdating;

  const toggleTooltip = isPodArchived
    ? "This Pod is archived; settings cannot be changed."
    : !isAdmin
      ? ADMIN_CONTROLLED_NON_ADMIN_TOOLTIP
      : ADMIN_CONTROLLED_DESCRIPTION;

  const handleToggle = useCallback(async () => {
    if (structurallyDisabled) {
      return;
    }

    if (pod.isAdminControlled) {
      const confirmed = await confirm({
        title: "Switch to self-serve Pod?",
        message:
          "The longest-standing member will become the Pod editor again. Connected data attached as Space data sources will remain until removed separately.",
        validateVariant: "warning",
        validateLabel: "Switch to self-serve",
        cancelLabel: "Cancel",
      });
      if (!confirmed) {
        return;
      }
      setIsUpdating(true);
      try {
        await updatePodMetadata({ isAdminControlled: false });
      } finally {
        setIsUpdating(false);
      }
      return;
    }

    const confirmed = await confirm({
      title: "Make this Pod admin-controlled?",
      message:
        "Current editors will become regular members. Only workspace admins will manage membership and connected data for this Pod.",
      validateVariant: "warning",
      validateLabel: "Make admin-controlled",
      cancelLabel: "Cancel",
    });
    if (!confirmed) {
      return;
    }

    setIsUpdating(true);
    try {
      await updatePodMetadata({ isAdminControlled: true });
    } finally {
      setIsUpdating(false);
    }
  }, [confirm, pod.isAdminControlled, structurallyDisabled, updatePodMetadata]);

  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <PodSettingsOptionLabel
        icon={Lock01}
        title="Admin-controlled"
        description={ADMIN_CONTROLLED_DESCRIPTION}
      />
      <div className="flex shrink-0 items-center gap-2">
        {sliderDisabled && !isUpdating ? (
          <Tooltip
            label={toggleTooltip}
            trigger={
              <div>
                <SliderToggle
                  selected={pod.isAdminControlled}
                  onClick={handleToggle}
                  disabled
                />
              </div>
            }
          />
        ) : (
          <SliderToggle
            selected={pod.isAdminControlled}
            onClick={handleToggle}
            disabled={sliderDisabled}
          />
        )}
      </div>
    </div>
  );
}
