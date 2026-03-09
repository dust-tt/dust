import { useClientType } from "@app/lib/context/clientType";
import { useFetcher } from "@app/lib/swr/swr";
import type { PostConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations";
import type {
  InternalPostConversationsRequestBodySchema,
  SupportedContentNodeContentType,
} from "@app/types/api/internal/assistant";
import { isSupportedContentNodeFragmentContentType } from "@app/types/api/internal/assistant";
import type {
  ClientMessageOrigin,
  ConversationMetadata,
  ConversationType,
  ConversationVisibility,
  SubmitMessageError,
} from "@app/types/assistant/conversation";
import type { MentionType } from "@app/types/assistant/mentions";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import { isAPIErrorResponse } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { UserType, WorkspaceType } from "@app/types/user";
import type * as t from "io-ts";
import { useCallback } from "react";

export function useCreateConversationWithMessage({
  owner,
  user,
}: {
  owner: WorkspaceType;
  user: UserType | null;
}) {
  const { fetcher } = useFetcher();
  const contextOrigin = useClientType();

  return useCallback(
    async ({
      messageData,
      metadata,
      skipToolsValidation = false,
      spaceId,
      title,
      visibility = "unlisted",
    }: {
      messageData: {
        input: string;
        mentions: MentionType[];
        contentFragments: ContentFragmentsType;
        clientSideMCPServerIds?: string[];
        selectedMCPServerViewIds?: string[];
        selectedSkillIds?: string[];
        origin?: ClientMessageOrigin;
      };
      visibility?: ConversationVisibility;
      title?: string;
      spaceId?: string | null;
      metadata?: ConversationMetadata;
      skipToolsValidation?: boolean;
    }): Promise<Result<ConversationType, SubmitMessageError>> => {
      if (!user) {
        return new Err({
          type: "message_send_error",
          title: "User not found",
          message: "Cannot create conversation without a user",
        });
      }

      const {
        input,
        mentions,
        contentFragments,
        clientSideMCPServerIds,
        selectedMCPServerViewIds,
        selectedSkillIds,
        origin: messageOrigin,
      } = messageData;
      const origin = messageOrigin ?? contextOrigin;

      const body: t.TypeOf<typeof InternalPostConversationsRequestBodySchema> =
        {
          title: title ?? null,
          visibility,
          spaceId: spaceId ?? null,
          metadata,
          skipToolsValidation,
          message: {
            content: input,
            context: {
              timezone:
                Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
              profilePictureUrl: user.image,
              clientSideMCPServerIds,
              selectedMCPServerViewIds,
              selectedSkillIds,
              origin,
            },
            mentions,
          },
          contentFragments: [
            ...contentFragments.uploaded.map((cf) => ({
              title: cf.title,
              url: cf.url,
              context: {
                profilePictureUrl: user.image,
              },
              fileId: cf.fileId,
            })),
            ...contentFragments.contentNodes.map((cf) => {
              const contentType = isSupportedContentNodeFragmentContentType(
                cf.mimeType
              )
                ? (cf.mimeType as SupportedContentNodeContentType)
                : null;
              if (!contentType) {
                throw new Error(
                  `Unsupported content node fragment mime type: ${cf.mimeType}`
                );
              }

              return {
                title: cf.title,
                context: {
                  profilePictureUrl: user.image,
                },
                nodeId: cf.internalId,
                nodeDataSourceViewId: cf.dataSourceView.sId,
              };
            }),
          ],
        };

      // Create new conversation and post the initial message at the same time.
      try {
        const conversationData = (await fetcher(
          `/api/w/${owner.sId}/assistant/conversations`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        )) as PostConversationsResponseBody;

        return new Ok(conversationData.conversation);
      } catch (e) {
        const isApiError = isAPIErrorResponse(e);
        return new Err({
          type:
            isApiError && e.error.type === "plan_message_limit_exceeded"
              ? "plan_limit_reached_error"
              : "message_send_error",
          title: "Your message could not be sent.",
          message: isApiError
            ? // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              e.error.message || "Please try again or contact us."
            : "Please try again or contact us.",
        });
      }
    },
    [owner, user, fetcher, contextOrigin]
  );
}
