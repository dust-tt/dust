import { useClientType } from "@app/lib/context/clientType";
import { clientFetch } from "@app/lib/egress/client";
import { getLocalTimeZone } from "@app/lib/i18n/format";
import { useResumeOngoingAgentLoopsPolling } from "@app/lib/swr/ongoing_agent_loops";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { PostMessagesResponseBody } from "@app/types/api/assistant/messages";
import type {
  ClientMessageOrigin,
  SubmitMessageError,
} from "@app/types/assistant/conversation";
import type { MentionType } from "@app/types/assistant/mentions";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import type { APIError } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { UserType, WorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";

// Bounded concurrency for content fragment POSTs: each grabs a per-conversation advisory lock
// (getConversationRankVersionLock) that serializes inserts, so posting them unbounded races the
// lock and times out (SequelizeDatabaseError).
const CONTENT_FRAGMENT_POST_CONCURRENCY = 8;

/**
 * @cc [owner:id13,label:performance;react] submitted-message-resumes-agent-loop-polling
 * After a message request succeeds, ongoing-loop polling MUST resume at the active interval without
 * waiting for the idle poll.
 */
export function useSubmitMessage({
  owner,
  user,
  conversationId,
}: {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string | null;
}) {
  const { t } = useLingui();
  const contextOrigin = useClientType();
  const resumeOngoingAgentLoopsPolling = useResumeOngoingAgentLoopsPolling(
    owner.sId
  );

  return useCallback(
    async (messageData: {
      input: string;
      mentions: MentionType[];
      contentFragments: ContentFragmentsType;
      clientSideMCPServerIds?: string[];
      selectedMCPServerViewIds?: string[];
      selectedSpaceIds?: string[];
      origin?: ClientMessageOrigin;
      skipToolsValidation?: boolean;
      modelSelection?: ModelSelectionType;
    }): Promise<Result<PostMessagesResponseBody, SubmitMessageError>> => {
      if (!conversationId) {
        return new Err({
          type: "message_send_error",
          title: t`Conversation not found`,
          error: {
            type: "conversation_not_found",
            message: "Cannot send message without a conversation",
          } satisfies APIError,
        });
      }

      const {
        input,
        mentions,
        contentFragments,
        clientSideMCPServerIds,
        selectedMCPServerViewIds,
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
        const timezone = getLocalTimeZone() || "Etc/UTC";

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
              title: t`Error uploading file.`,
              error: data,
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
              timezone: getLocalTimeZone() || "Etc/UTC",
              profilePictureUrl: user.image,
              clientSideMCPServerIds,
              selectedMCPServerViewIds,
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
            title: t`Your message is too long to be sent.`,
            error: {
              type: "content_too_large",
              message: "Please try again with a shorter message.",
            } satisfies APIError,
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
                  : data.error.type === "group_shared_usage_limit_reached"
                    ? "group_shared_usage_limit_reached_error"
                    : data.error.type === "no_seat"
                      ? "no_seat_error"
                      : "message_send_error",
          title: t`Your message could not be sent.`,
          error: data,
        });
      }

      const response: PostMessagesResponseBody = await mRes.json();
      resumeOngoingAgentLoopsPolling();

      return new Ok(response);
    },
    [
      owner,
      user,
      conversationId,
      contextOrigin,
      resumeOngoingAgentLoopsPolling,
      t,
    ]
  );
}
