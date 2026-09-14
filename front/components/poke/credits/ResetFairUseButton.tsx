import { useSendNotification } from "@app/hooks/useNotification";
import { useRunPokePlugin } from "@app/poke/swr/plugins";
import type { WorkspaceType } from "@app/types/user";
import { Button } from "@dust-tt/sparkle";
import { useState } from "react";

const RESET_MESSAGE_RATE_LIMIT_PLUGIN_ID = "reset-message-rate-limit";

interface ResetFairUseButtonProps {
  owner: WorkspaceType;
  // Email of the member whose fair-use AWU counter should be reset.
  userEmail: string;
  label?: string;
  // Called after a successful reset so callers can refresh their data.
  onReset?: () => void;
}

export function ResetFairUseButton({
  owner,
  userEmail,
  label = "Reset",
  onReset,
}: ResetFairUseButtonProps) {
  const sendNotification = useSendNotification();
  const [isRunning, setIsRunning] = useState(false);

  const { doRunPlugin } = useRunPokePlugin({
    pluginId: RESET_MESSAGE_RATE_LIMIT_PLUGIN_ID,
    pluginResourceTarget: {
      resourceType: "workspaces",
      resourceId: owner.sId,
      workspace: owner,
    },
  });

  const handleClick = async () => {
    setIsRunning(true);
    const result = await doRunPlugin({
      resetTarget: ["user_awu_fair_use"],
      userEmail,
    });
    setIsRunning(false);

    if (result.isErr()) {
      sendNotification({
        type: "error",
        title: "Failed to reset fair-use",
        description: result.error,
      });
      return;
    }

    sendNotification({
      type: "success",
      title: "Fair-use reset",
      description:
        result.value.display === "text"
          ? result.value.value
          : `Fair-use limit reset for ${userEmail}.`,
    });
    onReset?.();
  };

  return (
    <Button
      variant="outline"
      size="xs"
      label={label}
      isLoading={isRunning}
      onClick={handleClick}
    />
  );
}
