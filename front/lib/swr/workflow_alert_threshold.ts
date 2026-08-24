import { useSendNotification } from "@app/hooks/useNotification";
import { useFetcher } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

export type WorkflowAlertThresholdDecision = "continue" | "decline";

interface UseResolveWorkflowAlertThresholdPauseParams {
  owner: LightWorkspaceType;
  conversationId: string;
  messageId: string;
}

export function useResolveWorkflowAlertThresholdPause({
  owner,
  conversationId,
  messageId,
}: UseResolveWorkflowAlertThresholdPauseParams) {
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();
  const [submittingDecision, setSubmittingDecision] =
    useState<WorkflowAlertThresholdDecision | null>(null);

  const resolve = useCallback(
    async (decision: WorkflowAlertThresholdDecision) => {
      setSubmittingDecision(decision);
      try {
        await fetcher(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/workflow-alert-threshold`,
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
