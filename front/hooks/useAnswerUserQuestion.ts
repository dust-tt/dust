import { clientFetch } from "@app/lib/egress/client";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

interface UseAnswerUserQuestionParams {
  owner: LightWorkspaceType;
  onError: (errorMessage: string) => void;
}

export function useAnswerUserQuestion({
  owner,
  onError,
}: UseAnswerUserQuestionParams) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const answerQuestion = useCallback(
    async ({
      conversationId,
      messageId,
      actionId,
      selectedOptions,
      customResponse,
    }: {
      conversationId: string;
      messageId: string;
      actionId: string;
      selectedOptions?: number[];
      customResponse?: string;
    }) => {
      setIsSubmitting(true);

      try {
        const response = await clientFetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/answer-question`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              actionId,
              selectedOptions,
              customResponse,
            }),
          }
        );

        if (!response.ok) {
          try {
            const errData = await response.json();
            if (errData?.error.type === "action_not_blocked") {
              return { success: true };
            }
          } catch {
            // ignore JSON parsing errors
          }
          onError("Failed to submit answer. Please try again.");
          return { success: false };
        }

        return { success: true };
      } catch {
        onError("Failed to submit answer. Please try again.");
        return { success: false };
      } finally {
        setIsSubmitting(false);
      }
    },
    [owner.sId, onError]
  );

  return { answerQuestion, isSubmitting };
}
