import type * as t from "io-ts";
import { useCallback } from "react";

import { clientFetch } from "@app/lib/egress/client";
import type { PostConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations";
import type {
  ContentFragmentsType,
  ConversationType,
  ConversationVisibility,
  InternalPostConversationsRequestBodySchema,
  MentionType,
  Result,
  SubmitMessageError,
  SupportedContentNodeContentType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { Err, isSupportedContentNodeFragmentContentType, Ok } from "@app/types";

export function useCreateConversationWithMessage({
  owner,
  user,
}: {
  owner: WorkspaceType;
  user: UserType | null;
}) {
  return useCallback(
    async ({
      messageData,
      visibility = "unlisted",
      title,
    }: {
      messageData: {
        input: string;
        mentions: MentionType[];
        contentFragments: ContentFragmentsType;
        clientSideMCPServerIds?: string[];
        selectedMCPServerViewIds?: string[];
      };
      visibility?: ConversationVisibility;
      title?: string;
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
      } = messageData;

      const body: t.TypeOf<typeof InternalPostConversationsRequestBodySchema> =
        {
          title: title ?? null,
          visibility,
          message: {
            content: input,
            context: {
              timezone:
                Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
              profilePictureUrl: user.image,
              clientSideMCPServerIds,
              selectedMCPServerViewIds,
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
      const cRes = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (!cRes.ok) {
        const data = await cRes.json();
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

      const conversationData =
        (await cRes.json()) as PostConversationsResponseBody;

      return new Ok(conversationData.conversation);
    },
    [owner, user]
  );
}
