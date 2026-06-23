import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { useClientType } from "@app/lib/context/clientType";
import { clientFetch } from "@app/lib/egress/client";
import { useFetcher } from "@app/lib/swr/swr";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { PostConversationsResponseBody } from "@app/types/api/assistant/conversation/types";
import type {
  InternalPostConversationsRequestBodySchema,
  SupportedContentNodeContentType,
} from "@app/types/api/internal/assistant";
import {
  isSupportedContentNodeFragmentContentType,
  PostConversationsResponseBodySchema,
} from "@app/types/api/internal/assistant";
import type {
  ClientMessageOrigin,
  ConversationMetadata,
  ConversationType,
  ConversationVisibility,
  SubmitMessageError,
} from "@app/types/assistant/conversation";
import type { MentionType, RichMention } from "@app/types/assistant/mentions";
import type { ContentFragmentsType } from "@app/types/content_fragment";
import { isAPIErrorResponse } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { UserType, WorkspaceType } from "@app/types/user";
import { useCallback, useContext } from "react";
import type { z } from "zod";

export function useCreateConversationWithMessage({
  owner,
  user,
}: {
  owner: WorkspaceType;
  user: UserType | null;
}) {
  const { fetcher } = useFetcher();
  const contextOrigin = useClientType();
  const sendNotification = useSendNotification();
  const { setPendingFirstMessage, clearPendingFirstMessage } =
    useContext(InputBarContext);

  return useCallback(
    async ({
      messageData,
      metadata,
      skipToolsValidation = false,
      spaceId,
      title,
      visibility = "unlisted",
      deferMessage = false,
      onError,
    }: {
      messageData: {
        input: string;
        mentions: MentionType[];
        contentFragments: ContentFragmentsType;
        clientSideMCPServerIds?: string[];
        selectedMCPServerViewIds?: string[];
        origin?: ClientMessageOrigin;
        // Rich mentions used to render optimistic placeholder messages when the
        // first message is deferred and posted from `ConversationViewer`.
        richMentions?: RichMention[];
      };
      visibility?: ConversationVisibility;
      title?: string;
      spaceId?: string | null;
      metadata?: ConversationMetadata;
      skipToolsValidation?: boolean;
      // When true, create the conversation without the initial message and stash
      // the message so placeholders render immediately. The message (and tools) are
      // posted in the background so the caller can navigate as soon as the `sId`
      // is known.
      deferMessage?: boolean;
      // Called when the deferred background message-post fails. The caller decides
      // how to surface it (e.g. a blocking popup for limit errors). When omitted,
      // background failures fall back to an error notification.
      onError?: (err: SubmitMessageError) => void;
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
        origin: messageOrigin,
        richMentions,
      } = messageData;
      const origin = messageOrigin ?? contextOrigin;

      if (deferMessage) {
        const createBody: z.infer<
          typeof InternalPostConversationsRequestBodySchema
        > = {
          title: title ?? null,
          visibility,
          spaceId: spaceId ?? null,
          metadata,
          skipToolsValidation,
          message: null,
          contentFragments: [],
        };

        try {
          const conversationData = parsePostConversationsResponse(
            await fetcher(`/api/w/${owner.sId}/assistant/conversations`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(createBody),
            })
          );

          // Stash the message so `ConversationViewer` can render optimistic
          // placeholders immediately (display only).
          const conversationId = conversationData.conversation.sId;

          setPendingFirstMessage(conversationId, {
            input,
            mentions: richMentions ?? [],
            contentFragments,
          });

          // Post the message in the background so navigation isn't blocked on it.
          void postFirstMessageInBackground({
            workspaceId: owner.sId,
            conversationId,
            input,
            mentions,
            contentFragments,
            clientSideMCPServerIds,
            selectedMCPServerViewIds,
            origin,
            skipToolsValidation,
            profilePictureUrl: user.image,
            onError:
              onError ??
              ((err) => {
                sendNotification({
                  title: err.title,
                  description: err.message,
                  type: "error",
                });
              }),
          }).finally(() => {
            clearPendingFirstMessage(conversationId);
          });

          return new Ok(conversationData.conversation);
        } catch (e) {
          return toConversationCreationError(e);
        }
      }

      const body: z.infer<typeof InternalPostConversationsRequestBodySchema> = {
        title: title ?? null,
        visibility,
        spaceId: spaceId ?? null,
        metadata,
        skipToolsValidation,
        message: {
          content: input,
          context: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            profilePictureUrl: user.image,
            clientSideMCPServerIds,
            selectedMCPServerViewIds,
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
        const conversationData = parsePostConversationsResponse(
          await fetcher(`/api/w/${owner.sId}/assistant/conversations`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          })
        );

        return new Ok(conversationData.conversation);
      } catch (e) {
        return toConversationCreationError(e);
      }
    },
    [
      owner,
      user,
      fetcher,
      contextOrigin,
      sendNotification,
      setPendingFirstMessage,
      clearPendingFirstMessage,
    ]
  );
}

// Posts the first message of a deferred conversation in the background. Mirrors
// useSubmitMessage (content fragments first, then the message). Errors are
// swallowed/logged: the conversation already exists and the user is on its page.
async function postFirstMessageInBackground({
  workspaceId,
  conversationId,
  input,
  mentions,
  contentFragments,
  clientSideMCPServerIds,
  selectedMCPServerViewIds,
  origin,
  skipToolsValidation,
  profilePictureUrl,
  onError,
}: {
  workspaceId: string;
  conversationId: string;
  input: string;
  mentions: MentionType[];
  contentFragments: ContentFragmentsType;
  clientSideMCPServerIds?: string[];
  selectedMCPServerViewIds?: string[];
  origin: ClientMessageOrigin;
  skipToolsValidation: boolean;
  profilePictureUrl: string | null;
  onError?: (err: SubmitMessageError) => void;
}): Promise<void> {
  const timezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Etc/UTC";

  try {
    const contentFragmentUploads = [
      ...contentFragments.uploaded.map((cf) => ({
        kind: "uploaded" as const,
        cf,
      })),
      ...contentFragments.contentNodes.map((cf) => ({
        kind: "contentNode" as const,
        cf,
      })),
    ];

    if (contentFragmentUploads.length > 0) {
      await concurrentExecutor(
        contentFragmentUploads,
        async (item) => {
          if (item.kind === "uploaded") {
            const { cf } = item;
            await clientFetch(
              `/api/w/${workspaceId}/assistant/conversations/${conversationId}/content_fragment`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: cf.title,
                  fileId: cf.fileId,
                  url: cf.url,
                  context: { timezone, profilePictureUrl },
                }),
              }
            );
            return;
          }

          const { cf } = item;
          await clientFetch(
            `/api/w/${workspaceId}/assistant/conversations/${conversationId}/content_fragment`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: cf.title,
                nodeId: cf.internalId,
                nodeDataSourceViewId: cf.dataSourceView.sId,
                context: { timezone, profilePictureUrl },
              }),
            }
          );
        },
        { concurrency: 8 }
      );
    }

    const msgRes = await clientFetch(
      `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: input,
          context: {
            timezone,
            profilePictureUrl,
            clientSideMCPServerIds,
            selectedMCPServerViewIds,
            origin,
          },
          mentions,
          skipToolsValidation,
        }),
      }
    );
    if (!msgRes.ok) {
      const body = await msgRes.json().catch(() => null);
      if (onError) {
        const errResult = toConversationCreationError(
          isAPIErrorResponse(body) ? body : new Error("Failed to post message")
        );
        if (errResult.isErr()) {
          onError(errResult.error);
        }
      }
    }
  } catch (e) {
    logger.error({ err: e }, "Failed to post first message in background");
    if (onError) {
      const err = toConversationCreationError(e);
      if (err.isErr()) {
        onError(err.error);
      }
    }
  }
}

function parsePostConversationsResponse(
  data: unknown
): PostConversationsResponseBody {
  const parsed = PostConversationsResponseBodySchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid create conversation response");
  }
  return parsed.data as PostConversationsResponseBody;
}

function toConversationCreationError(
  e: unknown
): Result<never, SubmitMessageError> {
  const isApiError = isAPIErrorResponse(e);
  return new Err({
    type:
      isApiError && e.error.type === "plan_message_limit_exceeded"
        ? "plan_limit_reached_error"
        : isApiError && e.error.type === "credits_exhausted"
          ? "credits_exhausted_error"
          : isApiError && e.error.type === "user_cap_reached"
            ? "user_cap_reached_error"
            : isApiError && e.error.type === "no_seat"
              ? "no_seat_error"
              : "message_send_error",
    title: "Your message could not be sent.",
    message: isApiError
      ? // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        e.error.message || "Please try again or contact us."
      : "Please try again or contact us.",
  });
}
