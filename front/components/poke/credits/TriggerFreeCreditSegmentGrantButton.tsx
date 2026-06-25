import { useSendNotification } from "@app/hooks/useNotification";
import { useRunPokePlugin } from "@app/poke/swr/plugins";
import type { WorkspaceType } from "@app/types/user";
import { Button } from "@dust-tt/sparkle";
import { useState } from "react";

const TRIGGER_FREE_CREDIT_PLUGIN_ID = "trigger-free-credit-segment-grant";

interface TriggerFreeCreditSegmentGrantButtonProps {
  owner: WorkspaceType;
  metronomeCreditId: string;
}

export function TriggerFreeCreditSegmentGrantButton({
  owner,
  metronomeCreditId,
}: TriggerFreeCreditSegmentGrantButtonProps) {
  const sendNotification = useSendNotification();
  const [isRunning, setIsRunning] = useState(false);

  const { doRunPlugin } = useRunPokePlugin({
    pluginId: TRIGGER_FREE_CREDIT_PLUGIN_ID,
    pluginResourceTarget: {
      resourceType: "workspaces",
      resourceId: owner.sId,
      workspace: owner,
    },
  });

  const handleClick = async () => {
    setIsRunning(true);
    const result = await doRunPlugin({ metronomeCreditId });
    setIsRunning(false);

    if (result.isErr()) {
      sendNotification({
        type: "error",
        title: "Failed to trigger free credit grant",
        description: result.error,
      });
      return;
    }

    sendNotification({
      type: "success",
      title: "Free credit grant triggered",
      description:
        result.value.display === "text" ? result.value.value : undefined,
    });
  };

  return (
    <Button
      variant="outline"
      size="xs"
      label="Grant"
      isLoading={isRunning}
      onClick={handleClick}
    />
  );
}
