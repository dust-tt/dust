import { useCreateConversationWithMessage } from "@app/hooks/useCreateConversationWithMessage";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import type { InboxNotification } from "@app/hooks/useInboxNotifications";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import { useUser } from "@app/lib/swr/user";
import { getConversationRoute } from "@app/lib/utils/router";
import { isString } from "@app/types/shared/utils/general";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type { WorkspaceType } from "@app/types/user";
import { useCallback, useRef, useState } from "react";

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
  const loadingRef = useRef(false);

  const handleNotificationClick = useCallback(
    async (notification: InboxNotification) => {
      if (loadingRef.current) {
        return;
      }

      const agentConfigurationId = notification.data?.agentConfigurationId;
      const agentName = notification.data?.agentName;

      if (isString(agentConfigurationId) && isString(agentName)) {
        loadingRef.current = true;
        setLoadingNotificationId(notification.id);

        // Fetch pending suggestions for the agent.
        const suggestionsUrl = `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}/suggestions?states=pending`;
        const suggestionsResponse = await clientFetch(suggestionsUrl);
        const suggestions: AgentSuggestionType[] = [];

        if (suggestionsResponse.ok) {
          const body: { suggestions: AgentSuggestionType[] } =
            await suggestionsResponse.json();
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
          const file = new File([text], `suggestions-${agentName}.txt`, {
            type: "text/plain",
          });
          const blobs = await fileUploaderService.handleFilesUpload([file]);

          if (blobs) {
            for (const blob of blobs) {
              if (blob.fileId) {
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
            origin: "reinforced_agent_notification",
          },
          visibility: "unlisted",
          metadata: {
            reinforcedAgentNotification: {
              agentName,
              agentConfigurationId,
            },
          },
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

        if (uploaded.length > 0) {
          fileUploaderService.resetUpload();
        }
        loadingRef.current = false;
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
