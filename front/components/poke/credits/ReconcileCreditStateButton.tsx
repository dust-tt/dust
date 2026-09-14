import { useSendNotification } from "@app/hooks/useNotification";
import type { ReconcileCreditStateTarget } from "@app/lib/api/metronome/reconcile_credit_state";
import { useRunPokePlugin } from "@app/poke/swr/plugins";
import type { WorkspaceType } from "@app/types/user";
import { Button } from "@dust-tt/sparkle";
import { useState } from "react";

const RECONCILE_CREDIT_STATE_PLUGIN_ID = "reconcile-credit-state";

interface ReconcileSummary {
  corrected: boolean;
  description: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function summarizeStateTransition(
  report: Record<string, unknown>
): ReconcileSummary {
  const corrected = report.corrected === true;
  const previousState = String(report.previousState ?? "?");
  const newState = String(report.newState ?? "?");
  return {
    corrected,
    description: corrected
      ? `${previousState} → ${newState}`
      : `State: ${newState}`,
  };
}

// The plugin reports as untyped JSON, in one of two shapes: the pool /
// programmatic / user targets return a flat previous/new state, while
// `api_key` returns a `keys` array (key names aren't unique, so reconciling a
// name covers every active key sharing it).
function summarizeReconcileReport(value: unknown): ReconcileSummary {
  if (!isRecord(value)) {
    return { corrected: false, description: "State: ?" };
  }
  const { keys } = value;
  if (!Array.isArray(keys)) {
    return summarizeStateTransition(value);
  }
  const summaries = keys.filter(isRecord).map(summarizeStateTransition);
  if (summaries.length === 0) {
    return { corrected: false, description: "No active key with this name." };
  }
  return {
    corrected: summaries.some((summary) => summary.corrected),
    description: summaries.map((summary) => summary.description).join(" · "),
  };
}

interface ReconcileCreditStateButtonProps {
  owner: WorkspaceType;
  target: ReconcileCreditStateTarget;
  // Required when target is "user".
  userId?: string;
  // Required when target is "api_key".
  keyName?: string;
  label?: string;
  // Called after a successful reconcile so callers can refresh their data.
  onReconciled?: () => void;
}

export function ReconcileCreditStateButton({
  owner,
  target,
  userId,
  keyName,
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
    // The plugin's arg schema requires every string arg to be present (the
    // `dependsOn` conditions only drive rendering, not validation), so send the
    // conditional userId/keyName as empty strings when they don't apply.
    const result = await doRunPlugin({
      target: [target],
      mode: ["execute"],
      userId: userId ?? "",
      keyName: keyName ?? "",
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

    const { corrected, description } = summarizeReconcileReport(
      result.value.display === "json" ? result.value.value : undefined
    );

    sendNotification({
      type: "success",
      title: corrected
        ? `Reconciled ${target} state`
        : `${target} state already in sync`,
      description,
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
