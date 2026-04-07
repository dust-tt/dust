import type { UserQuestionAnswer } from "@app/lib/actions/types";
import { useFetcher } from "@app/lib/swr/swr";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

interface UseAnswerUserQuestionParams {
  owner: LightWorkspaceType;
}

export function useAnswerUserQuestion({ owner }: UseAnswerUserQuestionParams) {
  const { fetcher } = useFetcher();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setErrorMessage(null);

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
        setErrorMessage("Failed to submit answer. Please try again.");
        return { success: false };
      } finally {
        setIsSubmitting(false);
      }
    },
    [owner.sId, fetcher]
  );

  return { answerQuestion, isSubmitting, errorMessage };
}
