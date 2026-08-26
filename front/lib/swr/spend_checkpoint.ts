import { useSendNotification } from "@app/hooks/useNotification";
import { useFetcher } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

export type SpendCheckpointDecision = "continue" | "decline";

interface UseResolveSpendCheckpointPauseParams {
  owner: LightWorkspaceType;
  conversationId: string;
  messageId: string;
}

export function useResolveSpendCheckpointPause({
  owner,
  conversationId,
  messageId,
}: UseResolveSpendCheckpointPauseParams) {
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();
  const [submittingDecision, setSubmittingDecision] =
    useState<SpendCheckpointDecision | null>(null);

  const resolve = useCallback(
    async (decision: SpendCheckpointDecision) => {
      setSubmittingDecision(decision);
      try {
        await fetcher(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/spend-checkpoint`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision }),
          }
        );
        return { success: true };
      } catch {
        sendNotification({
          type: "error",
          title: "Failed to resolve",
          description:
            decision === "continue"
              ? "Could not resume the agent. Please try again."
              : "Could not stop the agent. Please try again.",
        });
        return { success: false };
      } finally {
        setSubmittingDecision(null);
      }
    },
    [owner.sId, conversationId, messageId, fetcher, sendNotification]
  );

  return { resolve, submittingDecision };
}
