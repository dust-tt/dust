import { useFetcher } from "@app/lib/swr/swr";
import type { PostMessagesResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/messages";
import type { SubmitMessageError } from "@app/types/assistant/conversation";
import type { MentionType } from "@app/types/assistant/mentions";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import { isAPIErrorResponse } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { UserType, WorkspaceType } from "@app/types/user";
import { useCallback } from "react";

export function useSubmitMessage({
  owner,
  user,
  conversationId,
}: {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string | null;
}) {
  const { fetcherWithBody } = useFetcher();

  return useCallback(
    async (messageData: {
      input: string;
      mentions: MentionType[];
      contentFragments: ContentFragmentsType;
      clientSideMCPServerIds?: string[];
      skipToolsValidation?: boolean;
    }): Promise<Result<PostMessagesResponseBody, SubmitMessageError>> => {
      if (!conversationId) {
        return new Err({
          type: "message_send_error",
          title: "Conversation not found",
          message: "Cannot send message without a conversation",
        });
      }

      const {
        input,
        mentions,
        contentFragments,
        clientSideMCPServerIds,
        skipToolsValidation,
      } = messageData;

      // Create a new content fragment.
      if (
        contentFragments.uploaded.length > 0 ||
        contentFragments.contentNodes.length > 0
      ) {
        const contentFragmentPromises = [
          ...contentFragments.uploaded.map((contentFragment) =>
            fetcherWithBody([
              `/api/w/${owner.sId}/assistant/conversations/${conversationId}/content_fragment`,
              {
                title: contentFragment.title,
                fileId: contentFragment.fileId,
                url: contentFragment.url,
                context: {
                  timezone:
                    Intl.DateTimeFormat().resolvedOptions().timeZone ||
                    "Etc/UTC",
                  profilePictureUrl: user.image,
                },
              },
              "POST",
            ])
          ),
          ...contentFragments.contentNodes.map((contentFragment) =>
            fetcherWithBody([
              `/api/w/${owner.sId}/assistant/conversations/${conversationId}/content_fragment`,
              {
                title: contentFragment.title,
                nodeId: contentFragment.internalId,
                nodeDataSourceViewId: contentFragment.dataSourceView.sId,
                context: {
                  timezone:
                    Intl.DateTimeFormat().resolvedOptions().timeZone ||
                    "Etc/UTC",
                  profilePictureUrl: user.image,
                },
              },
              "POST",
            ])
          ),
        ];

        try {
          await Promise.all(contentFragmentPromises);
        } catch (e) {
          if (isAPIErrorResponse(e)) {
            return new Err({
              type: "attachment_upload_error",
              title: "Error uploading file.",
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              message: e.error.message || "Please try again or contact us.",
            });
          }
          return new Err({
            type: "attachment_upload_error",
            title: "Error uploading file.",
            message: "Please try again or contact us.",
          });
        }
      }

      // Create a new user message.
      try {
        const data = await fetcherWithBody([
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages`,
          {
            content: input,
            context: {
              timezone:
                Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC",
              profilePictureUrl: user.image,
              clientSideMCPServerIds,
            },
            mentions,
            skipToolsValidation,
          },
          "POST",
        ]);

        return new Ok(data as PostMessagesResponseBody);
      } catch (e) {
        if (isAPIErrorResponse(e)) {
          return new Err({
            type:
              e.error.type === "plan_message_limit_exceeded"
                ? "plan_limit_reached_error"
                : "message_send_error",
            title: "Your message could not be sent.",
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            message: e.error.message || "Please try again or contact us.",
          });
        }
        return new Err({
          type: "message_send_error",
          title: "Your message could not be sent.",
          message: "Please try again or contact us.",
        });
      }
    },
    [owner, user, conversationId, fetcherWithBody]
  );
}
