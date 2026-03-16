import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import type { FileBlob } from "@app/hooks/useFileUploaderService";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import type { InboxNotification } from "@app/hooks/useInboxNotifications";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import { useUser } from "@app/lib/swr/user";
import { getConversationRoute } from "@app/lib/utils/router";
import type { GetSuggestionsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/suggestions";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type { WorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function formatSuggestionsAsText(
  suggestions: AgentSuggestionType[],
  agentName: string
): string {
  const lines = [`Pending improvement suggestions for @${agentName}:`, ""];

  for (const suggestion of suggestions) {
    lines.push(
      `- [${suggestion.kind}] ${suggestion.analysis ?? "No analysis provided."}`
    );
  }

  return lines.join("\n");
}

function isFileBlobWithFileId(
  blob: FileBlob
): blob is FileBlob & { fileId: string } {
  return blob.fileId !== null;
}

interface UseNotificationClickHandlerParams {
  owner: WorkspaceType;
  markAsRead: (notificationId: string) => Promise<void>;
}

export function useNotificationClickHandler({
  owner,
  markAsRead,
}: UseNotificationClickHandlerParams) {
  const router = useAppRouter();
  const { user } = useUser();
  const sendNotification = useSendNotification();
  const createConversationWithMessage = useCreateConversationWithMessage({
    owner,
    user,
  });
  const fileUploaderService = useFileUploaderService({
    owner,
    useCase: "conversation",
  });

  const [loadingNotificationId, setLoadingNotificationId] = useState<
    string | null
  >(null);

  const handleNotificationClick = useCallback(
    async (notification: InboxNotification) => {
      if (loadingNotificationId) {
        return;
      }

      const agentConfigurationId = notification.data?.agentConfigurationId;
      const agentName = notification.data?.agentName;

      if (isString(agentConfigurationId) && isString(agentName)) {
        setLoadingNotificationId(notification.id);

        // Fetch pending suggestions for the agent.
        const suggestionsUrl = `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}/suggestions?states=pending`;
        const suggestionsResponse = await clientFetch(suggestionsUrl);
        const suggestions: AgentSuggestionType[] = [];

        if (suggestionsResponse.ok) {
          const body =
            (await suggestionsResponse.json()) as GetSuggestionsResponseBody;
          suggestions.push(...body.suggestions);
        }

        // Upload suggestions as a text file content fragment.
        const uploaded: {
          fileId: string;
          title: string;
          contentType: "text/plain";
        }[] = [];

        if (suggestions.length > 0) {
          const text = formatSuggestionsAsText(suggestions, agentName);
          const fileName = `suggestions-${agentName}.txt`;
          const file = new File([text], fileName, { type: "text/plain" });
          const blobs = await fileUploaderService.handleFilesUpload([file]);

          if (blobs) {
            for (const blob of blobs) {
              if (isFileBlobWithFileId(blob)) {
                uploaded.push({
                  fileId: blob.fileId,
                  title: `Improvement suggestions for @${agentName}`,
                  contentType: "text/plain",
                });
              }
            }
          }
        }

        const result = await createConversationWithMessage({
          messageData: {
            input: `I have new improvement suggestions for my agent @${agentName}. Can you help me review and apply them?`,
            mentions: [{ configurationId: "dust" }],
            contentFragments: { uploaded, contentNodes: [] },
          },
          visibility: "unlisted",
        });

        if (result.isOk()) {
          void markAsRead(notification.id);
          void router.push(getConversationRoute(owner.sId, result.value.sId));
        } else {
          sendNotification({
            type: "error",
            title: "Failed to create conversation",
            description: result.error.message,
          });
        }

        fileUploaderService.resetUpload();
        setLoadingNotificationId(null);
      } else {
        // Fallback for notifications without agent data.
        void markAsRead(notification.id);
        const redirectUrl = notification.primaryAction?.redirect?.url;
        if (redirectUrl) {
          void router.push(redirectUrl);
        }
      }
    },
    [
      loadingNotificationId,
      createConversationWithMessage,
      fileUploaderService,
      markAsRead,
      router,
      owner.sId,
      sendNotification,
    ]
  );

  return { handleNotificationClick, loadingNotificationId };
}
