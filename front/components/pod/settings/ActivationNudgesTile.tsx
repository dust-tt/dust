import { PodSettingsOptionLabel } from "@app/components/pod/settings/PodSettingsOptionLabel";
import {
  useActivationNudgeSettings,
  useUpdateActivationNudgeSettings,
} from "@app/lib/swr/activation";
import type { RichSpaceType } from "@app/types/api/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import { Bell01, SliderToggle } from "@dust-tt/sparkle";
import { useCallback, useState } from "react";

interface ActivationNudgesTileProps {
  owner: LightWorkspaceType;
  pod: RichSpaceType;
}

export function ActivationNudgesTile({
  owner,
  pod,
}: ActivationNudgesTileProps) {
  const { activationNudgeSettings } = useActivationNudgeSettings({
    workspaceId: owner.sId,
    podId: pod.sId,
  });
  const { updateNudgeSettings } = useUpdateActivationNudgeSettings({
    workspaceId: owner.sId,
    podId: pod.sId,
  });
  const [isUpdating, setIsUpdating] = useState(false);

  const nudgesEnabled = activationNudgeSettings?.nudgesEnabled ?? false;

  const onToggle = useCallback(async () => {
    setIsUpdating(true);
    try {
      await updateNudgeSettings(!nudgesEnabled);
    } finally {
      setIsUpdating(false);
    }
  }, [nudgesEnabled, updateNudgeSettings]);

  // Only the person the check-ins are addressed to can turn them off, so the
  // tile is theirs alone.
  if (!activationNudgeSettings) {
    return null;
  }

  // The row carries its own separator: it is absent for everyone but the pod's
  // own user, and an empty separator would show through.
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border py-4">
      <PodSettingsOptionLabel
        icon={Bell01}
        title="Dust check-ins"
        description="Let Dust start a conversation here with a next step for you"
      />
      <SliderToggle
        selected={nudgesEnabled}
        disabled={isUpdating || !!pod.archivedAt}
        onClick={onToggle}
      />
    </div>
  );
}
