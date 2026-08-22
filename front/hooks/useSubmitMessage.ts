import { useClientType } from "@app/lib/context/clientType";
import { clientFetch } from "@app/lib/egress/client";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { PostMessagesResponseBody } from "@app/types/api/assistant/messages";
import type {
  ClientMessageOrigin,
  SubmitMessageError,
} from "@app/types/assistant/conversation";
import type { MentionType } from "@app/types/assistant/mentions";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { UserType, WorkspaceType } from "@app/types/user";
import { useCallback } from "react";

// Bounded concurrency for content fragment POSTs: each grabs a per-conversation advisory lock
// (getConversationRankVersionLock) that serializes inserts, so posting them unbounded races the
// lock and times out (SequelizeDatabaseError).
const CONTENT_FRAGMENT_POST_CONCURRENCY = 8;

export function useSubmitMessage({
  owner,
  user,
  conversationId: boundConversationId,
}: {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string | null;
}) {
  const contextOrigin = useClientType();

  return useCallback(
    async (messageData: {
      input: string;
      mentions: MentionType[];
      contentFragments: ContentFragmentsType;
      clientSideMCPServerIds?: string[];
      selectedSpaceIds?: string[];
      origin?: ClientMessageOrigin;
      skipToolsValidation?: boolean;
      modelSelection?: ModelSelectionType;
      /**
       * Overrides the bound conversation, for callers that only learn it as they submit — the App
       * builder creates the App and posts its first prompt in one go.
       */
      conversationId?: string;
    }): Promise<Result<PostMessagesResponseBody, SubmitMessageError>> => {
      const conversationId = messageData.conversationId ?? boundConversationId;
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
        selectedSpaceIds,
        origin: messageOrigin,
        skipToolsValidation,
        modelSelection,
      } = messageData;
      const origin = messageOrigin ?? contextOrigin;

      // Create a new content fragment.
      if (
        contentFragments.uploaded.length > 0 ||
        contentFragments.contentNodes.length > 0
      ) {
        const timezone =
          Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC";

        const contentFragmentBodies = [
          ...contentFragments.uploaded.map((cf) => ({
            title: cf.title,
            fileId: cf.fileId,
            url: cf.url,
            context: { timezone, profilePictureUrl: user.image },
          })),
          ...contentFragments.contentNodes.map((cf) => ({
            title: cf.title,
            nodeId: cf.internalId,
            nodeDataSourceViewId: cf.dataSourceView.sId,
            context: { timezone, profilePictureUrl: user.image },
          })),
        ];

        const contentFragmentsRes = await concurrentExecutor(
          contentFragmentBodies,
          async (body) => {
            return clientFetch(
              `/api/w/${owner.sId}/assistant/conversations/${conversationId}/content_fragment`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
              }
            );
          },
          { concurrency: CONTENT_FRAGMENT_POST_CONCURRENCY }
        );

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
                Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC",
              profilePictureUrl: user.image,
              clientSideMCPServerIds,
              selectedSpaceIds,
              origin,
            },
            mentions,
            skipToolsValidation,
            modelSelection,
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
              : data.error.type === "credits_exhausted"
                ? "credits_exhausted_error"
                : data.error.type === "user_cap_reached"
                  ? "user_cap_reached_error"
                  : data.error.type === "no_seat"
                    ? "no_seat_error"
                    : "message_send_error",
          title: "Your message could not be sent.",
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          message: data.error.message || "Please try again or contact us.",
        });
      }

      return new Ok(await mRes.json());
    },
    [owner, user, boundConversationId, contextOrigin]
  );
}
