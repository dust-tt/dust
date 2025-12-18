import { useCallback } from "react";

import { clientFetch } from "@app/lib/egress/client";
import type { PostMessagesResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/messages";
import type {
  ContentFragmentsType,
  MentionType,
  Result,
  SubmitMessageError,
  UserType,
  WorkspaceType,
} from "@app/types";
import { Err, Ok } from "@app/types";

export function useSubmitMessage({
  owner,
  user,
  conversationId,
}: {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string | null;
}) {
  return useCallback(
    async (messageData: {
      input: string;
      mentions: MentionType[];
      contentFragments: ContentFragmentsType;
      clientSideMCPServerIds?: string[];
    }): Promise<Result<PostMessagesResponseBody, SubmitMessageError>> => {
      if (!conversationId) {
        return new Err({
          type: "message_send_error",
          title: "Conversation not found",
          message: "Cannot send message without a conversation",
        });
      }

      const { input, mentions, contentFragments, clientSideMCPServerIds } =
        messageData;

      // Create a new content fragment.
      if (
        contentFragments.uploaded.length > 0 ||
        contentFragments.contentNodes.length > 0
      ) {
        const contentFragmentsRes = await Promise.all([
          ...contentFragments.uploaded.map((contentFragment) => {
            return clientFetch(
              `/api/w/${owner.sId}/assistant/conversations/${conversationId}/content_fragment`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  title: contentFragment.title,
                  fileId: contentFragment.fileId,
                  url: contentFragment.url,
                  context: {
                    timezone:
                      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                    profilePictureUrl: user.image,
                  },
                }),
              }
            );
          }),
          ...contentFragments.contentNodes.map((contentFragment) => {
            return clientFetch(
              `/api/w/${owner.sId}/assistant/conversations/${conversationId}/content_fragment`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  title: contentFragment.title,
                  nodeId: contentFragment.internalId,
                  nodeDataSourceViewId: contentFragment.dataSourceView.sId,
                  context: {
                    timezone:
                      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                    profilePictureUrl: user.image,
                  },
                }),
              }
            );
          }),
        ]);

        for (const mcfRes of contentFragmentsRes) {
          if (!mcfRes.ok) {
            const data = await mcfRes.json();
            console.error("Error creating content fragment", data);
            return new Err({
              type: "attachment_upload_error",
              title: "Error uploading file.",
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              message: data.error.message || "Please try again or contact us.",
            });
          }
        }
      }

      // Create a new user message.
      const mRes = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: input,
            context: {
              timezone:
                Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
              profilePictureUrl: user.image,
              clientSideMCPServerIds,
            },
            mentions,
          }),
        }
      );

      if (!mRes.ok) {
        if (mRes.status === 413) {
          return new Err({
            type: "content_too_large",
            title: "Your message is too long to be sent.",
            message: "Please try again with a shorter message.",
          });
        }
        const data = await mRes.json();
        return new Err({
          type:
            data.error.type === "plan_message_limit_exceeded"
              ? "plan_limit_reached_error"
              : "message_send_error",
          title: "Your message could not be sent.",
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          message: data.error.message || "Please try again or contact us.",
        });
      }

      return new Ok(await mRes.json());
    },
    [owner, user, conversationId]
  );
}
