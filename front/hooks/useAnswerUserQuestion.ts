import type { UserQuestionAnswer } from "@app/lib/actions/types";
import { useFetcher } from "@app/lib/swr/swr";
import { isAPIErrorResponse } from "@app/types/error";
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
  const { fetcher } = useFetcher();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const answerQuestion = useCallback(
    async ({
      conversationId,
      messageId,
      actionId,
      answer,
    }: {
      conversationId: string;
      messageId: string;
      actionId: string;
      answer: UserQuestionAnswer;
    }) => {
      setIsSubmitting(true);

      try {
        await fetcher(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/answer-question`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              actionId,
              answer,
            }),
          }
        );

        return { success: true };
      } catch (e) {
        if (isAPIErrorResponse(e) && e.error.type === "action_not_blocked") {
          return { success: true };
        }
        onError("Failed to submit answer. Please try again.");
        return { success: false };
      } finally {
        setIsSubmitting(false);
      }
    },
    [owner.sId, onError, fetcher]
  );

  return { answerQuestion, isSubmitting };
}
