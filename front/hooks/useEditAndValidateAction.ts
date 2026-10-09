import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import type {
  ActionApprovalStateType,
  AgentLoopBlockedToolExecution,
} from "@app/lib/actions/mcp";
import { useFetcher } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";

export function useEditAndValidateAction({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const { fetcher } = useFetcher();
  const [isEditingAndValidating, setIsEditingAndValidating] = useState(false);

  const editAndValidateAction = useCallback(
    async ({
      validationRequest,
      approvalState,
      editedArguments,
    }: {
      validationRequest: Pick<
        AgentLoopBlockedToolExecution,
        "actionId" | "conversationId" | "messageId"
      >;
      approvalState: ActionApprovalStateType;
      editedArguments: Record<string, unknown>;
    }) => {
      setIsEditingAndValidating(true);

      try {
        // Edit and validate the action. The backend resumes both the conversation
        // that contains the action and any blocked ancestor conversations.
        await fetcher(
          `/api/w/${owner.sId}/assistant/conversations/${validationRequest.conversationId}/messages/${validationRequest.messageId}/edit-and-validate-action`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              actionId: validationRequest.actionId,
              approvalState,
              editedArguments,
            }),
          }
        );

        return { success: true };
      } catch (err) {
        sendApiErrorNotification({
          title: t`Failed to edit and approve action`,
          error: err,
        });
        return { success: false };
      } finally {
        setIsEditingAndValidating(false);
      }
    },
    [owner.sId, fetcher, sendApiErrorNotification, t]
  );

  return { editAndValidateAction, isEditingAndValidating };
}
