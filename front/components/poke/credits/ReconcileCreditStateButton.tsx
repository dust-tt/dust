import { useSendNotification } from "@app/hooks/useNotification";
import type { ReconcileCreditStateTarget } from "@app/lib/api/metronome/reconcile_credit_state";
import { useRunPokePlugin } from "@app/poke/swr/plugins";
import type { WorkspaceType } from "@app/types/user";
import { Button } from "@dust-tt/sparkle";
import { useState } from "react";

const RECONCILE_CREDIT_STATE_PLUGIN_ID = "reconcile-credit-state";

interface ReconcileCreditStateButtonProps {
  owner: WorkspaceType;
  target: ReconcileCreditStateTarget;
  // Required when target is "user".
  userId?: string;
  label?: string;
  // Called after a successful reconcile so callers can refresh their data.
  onReconciled?: () => void;
}

export function ReconcileCreditStateButton({
  owner,
  target,
  userId,
  label = "Reconcile",
  onReconciled,
}: ReconcileCreditStateButtonProps) {
  const sendNotification = useSendNotification();
  const [isRunning, setIsRunning] = useState(false);

  const { doRunPlugin } = useRunPokePlugin({
    pluginId: RECONCILE_CREDIT_STATE_PLUGIN_ID,
    pluginResourceTarget: {
      resourceType: "workspaces",
      resourceId: owner.sId,
      workspace: owner,
    },
  });

  const handleClick = async () => {
    setIsRunning(true);
    const result = await doRunPlugin({
      target: [target],
      mode: ["execute"],
      userId: userId ?? "",
    });
    setIsRunning(false);

    if (result.isErr()) {
      sendNotification({
        type: "error",
        title: `Failed to reconcile ${target} state`,
        description: result.error,
      });
      return;
    }

    const value =
      result.value.display === "json" ? result.value.value : undefined;
    const corrected = value?.corrected === true;
    const previousState = String(value?.previousState ?? "?");
    const newState = String(value?.newState ?? "?");

    sendNotification({
      type: "success",
      title: corrected
        ? `Reconciled ${target} state`
        : `${target} state already in sync`,
      description: corrected
        ? `${previousState} → ${newState}`
        : `State: ${newState}`,
    });
    onReconciled?.();
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
