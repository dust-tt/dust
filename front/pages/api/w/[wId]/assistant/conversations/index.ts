import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import {
  createConversation,
  postNewContentFragment,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getPaginationParams } from "@app/lib/api/pagination";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import { InternalPostConversationsRequestBodySchema } from "@app/types/api/internal/assistant";
import type {
  ConversationType,
  ConversationWithoutContentType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import { ConversationError } from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetConversationsResponseBody = {
  conversations: ConversationWithoutContentType[];
  hasMore: boolean;
  lastValue: string | null;
};
export type PostConversationsResponseBody = {
  conversation: ConversationType;
  message?: UserMessageType;
  contentFragments: ContentFragmentType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetConversationsResponseBody | PostConversationsResponseBody | void
    >
  >,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();

  switch (req.method) {
    case "GET":
      const paginationRes = getPaginationParams(req, {
        defaultLimit: 100,
        defaultOrderColumn: "updatedAt",
        defaultOrderDirection: "desc",
        supportedOrderColumn: ["updatedAt"],
      });

      if (paginationRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: paginationRes.error.reason,
          },
        });
      }

      const pagination = paginationRes.value;

      const result =
        await ConversationResource.listPrivateConversationsForUserPaginated(
          auth,
          {
            limit: pagination.limit,
            lastValue: pagination.lastValue,
            orderDirection: pagination.orderDirection,
          }
        );

      res.status(200).json({
        conversations: result.conversations.map((c) => c.toJSON()),
        hasMore: result.hasMore,
        lastValue: result.lastValue,
      });
      return;

    case "POST":
      // Normalize spaceId: undefined -> null for backward compatibility
      // (users who haven't refreshed their browser may send undefined)
      if (req.body && req.body.spaceId === undefined) {
        req.body.spaceId = null;
      }

      const bodyValidation = InternalPostConversationsRequestBodySchema.decode(
        req.body
      );

      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const {
        title,
        visibility,
        spaceId,
        message,
        contentFragments,
        metadata,
        skipToolsValidation,
      } = bodyValidation.right;

      if (message?.context.clientSideMCPServerIds) {
        const hasServerAccess = await concurrentExecutor(
          message.context.clientSideMCPServerIds,
          async (serverId) =>
            validateMCPServerAccess(auth, {
              serverId,
            }),
          { concurrency: 10 }
        );

        if (hasServerAccess.some((r) => r === false)) {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "invalid_request_error",
              message:
                "User does not have access to the client-side MCP servers.",
            },
          });
        }
      }

      // Validate spaceId if provided and convert to model ID
      let spaceModelId: number | null = null;
      if (spaceId) {
        const space = await SpaceResource.fetchById(auth, spaceId);
        if (!space || !space.canReadOrAdministrate(auth)) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "space_not_found",
              message: "Space not found or access denied",
            },
          });
        }
        spaceModelId = space.id;
      }

      let conversation = await createConversation(auth, {
        title,
        visibility,
        spaceId: spaceModelId,
        metadata,
      });

      const newContentFragments: ContentFragmentType[] = [];
      let newMessage: UserMessageType | null = null;

      const baseContext = {
        username: user.username,
        fullName: user.fullName(),
        email: user.email,
      };

      if (contentFragments.length > 0) {
        const newContentFragmentsRes = await Promise.all(
          contentFragments.map((contentFragment) => {
            return postNewContentFragment(auth, conversation, contentFragment, {
              ...baseContext,
              profilePictureUrl: contentFragment.context.profilePictureUrl,
            });
          })
        );

        for (const r of newContentFragmentsRes) {
          if (r.isErr()) {
            if (r.isErr()) {
              return apiError(req, res, {
                status_code: 400,
                api_error: {
                  type: "invalid_request_error",
                  message: r.error.message,
                },
              });
            }
          }

          newContentFragments.push(r.value);
        }

        const updatedConversationRes = await getConversation(
          auth,
          conversation.sId
        );

        if (updatedConversationRes.isErr()) {
          // Preserving former code in which if the conversation was not found here, we do not error
          if (
            !(
              updatedConversationRes.error instanceof ConversationError &&
              updatedConversationRes.error.type === "conversation_not_found"
            )
          ) {
            return apiErrorForConversation(
              req,
              res,
              updatedConversationRes.error
            );
          }
        } else {
          conversation = updatedConversationRes.value;
        }
      }

      if (message) {
        // If tools are enabled, we need to add the MCP server views to the conversation before posting the message.
        if (message.context.selectedMCPServerViewIds) {
          const mcpServerViews = await MCPServerViewResource.fetchByIds(
            auth,
            message.context.selectedMCPServerViewIds
          );

          const r = await ConversationResource.upsertMCPServerViews(auth, {
            conversation,
            mcpServerViews,
            enabled: true,
          });
          if (r.isErr()) {
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "Failed to add MCP server views to conversation",
              },
            });
          }
        }

        // If JIT skills are selected, add them to the conversation before posting the message.
        if (message.context.selectedSkillIds) {
          const skills = await SkillResource.fetchByIds(
            auth,
            message.context.selectedSkillIds
          );

          const r = await SkillResource.upsertConversationSkills(auth, {
            conversationId: conversation.id,
            skills,
            enabled: true,
          });

          if (r.isErr()) {
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "Failed to add skills to conversation",
              },
            });
          }
        }

        // If a message was provided we do await for the message to be created before returning the
        // conversation along with the message.
        const messageRes = await postUserMessage(auth, {
          conversation,
          content: message.content,
          mentions: message.mentions,
          context: {
            timezone: message.context.timezone,
            username: user.username,
            fullName: user.fullName(),
            email: user.email,
            profilePictureUrl: message.context.profilePictureUrl,
            origin: message.context.origin ?? "web",
            clientSideMCPServerIds:
              message.context.clientSideMCPServerIds ?? [],
          },
          skipToolsValidation: skipToolsValidation ?? false,
        });
        if (messageRes.isErr()) {
          return apiError(req, res, messageRes.error);
        }

        newMessage = messageRes.value.userMessage;
      }

      if (newContentFragments.length > 0 || newMessage) {
        // If we created a user message or a content fragment (or both) we retrieve the
        // conversation. If a user message was posted, we know that the agent messages have been
        // created as well, so pulling the conversation again will allow to have an up to date view
        // of the conversation with agent messages included so that the user of the API can start
        // streaming events from these agent messages directly.
        const updatedRes = await getConversation(auth, conversation.sId);

        if (updatedRes.isErr()) {
          return apiErrorForConversation(req, res, updatedRes.error);
        }

        conversation = updatedRes.value;
      }

      res.status(200).json({
        conversation,
        message: newMessage ?? undefined,
        contentFragments: newContentFragments,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
