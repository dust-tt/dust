import { getMaximalVersionAgentStepContent } from "@app/lib/api/assistant/configuration/steps";
import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import type {
  AgentMessageType,
  ConversationType,
  LightAgentMessageType,
  LightConversationType,
  LightMessageType,
  MessageType,
  UserMessageType,
  UserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import {
  ConversationError,
  isAgentMessageType,
  isUserMessageType,
  isUserMessageTypeWithContentFragments,
} from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { isContentFragmentType } from "@app/types/content_fragment";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isArrayOf } from "@app/types/shared/typescipt_utils";
import { removeNulls } from "@app/types/shared/utils/general";

// Helper type to map viewType to the correct message type
type MessageTypeForView<V extends "light" | "full"> = V extends "light"
  ? LightMessageType
  : V extends "full"
    ? MessageType
    : never;

export const getConversation = async (
  auth: Authenticator,
  conversationId: string,
  includeDeleted: boolean = false
) => _getConversation(auth, conversationId, includeDeleted, "full");

export const getLightConversation = async (
  auth: Authenticator,
  conversationId: string,
  includeDeleted: boolean = false
) => _getConversation(auth, conversationId, includeDeleted, "light");

async function _getConversation<V extends "light" | "full">(
  auth: Authenticator,
  conversationId: string,
  includeDeleted: boolean = false,
  viewType: V = "full" as V
): Promise<
  Result<
    V extends "light"
      ? LightConversationType
      : V extends "full"
        ? ConversationType
        : never,
    ConversationError
  >
> {
  const owner = auth.getNonNullableWorkspace();

  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId,
    { includeDeleted }
  );

  if (!conversation) {
    return new Err(new ConversationError("conversation_not_found"));
  }

  const messages = await MessageModel.findAll({
    where: {
      conversationId: conversation.id,
      workspaceId: owner.id,
    },
    order: [
      ["rank", "ASC"],
      ["version", "ASC"],
    ],
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: false,
      },
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: false,
        include: [
          {
            model: AgentStepContentModel,
            as: "agentStepContents",
            required: false,
          },
        ],
      },
      // We skip ContentFragmentResource here for efficiency reasons (retrieving contentFragments
      // along with messages in one query). Only once we move to a MessageResource will we be able
      // to properly abstract this.
      {
        model: ContentFragmentModel,
        as: "contentFragment",
        required: false,
      },
    ],
  });

  // Filter to only keep the step content with the maximum version for each step and index combination.
  for (const message of messages) {
    if (message.agentMessage && message.agentMessage.agentStepContents) {
      message.agentMessage.agentStepContents =
        getMaximalVersionAgentStepContent(
          message.agentMessage.agentStepContents
        );
    }
  }

  const renderRes = await batchRenderMessages(
    auth,
    conversation,
    messages,
    viewType
  );

  if (renderRes.isErr()) {
    return new Err(renderRes.error);
  }

  // TypeScript will now properly narrow based on viewType
  const messagesWithRank = renderRes.value as MessageTypeForView<V>[];

  // We pre-create an array that will hold
  // the versions of each User/Assistant/ContentFragment message. The length of that array is by definition the
  // maximal rank of the conversation messages we just retrieved. In the case there is no message
  // the rank is -1 and the array length is 0 as expected.
  const rankMax = messages.reduce((acc, m) => Math.max(acc, m.rank), -1);
  const content: MessageTypeForView<V>[][] = Array.from(
    { length: rankMax + 1 },
    () => []
  );

  // Fill content array with proper typing
  for (const m of messagesWithRank) {
    content[m.rank].push(m);
  }

  const { actionRequired, lastReadAt } =
    await ConversationResource.getActionRequiredAndLastReadAtForUser(
      auth,
      conversation.id
    );

  if (viewType === "light") {
    // We only keep the last version of each message.
    const typeCheckedContent: (
      | LightAgentMessageType
      | UserMessageTypeWithContentFragments
    )[] = removeNulls(
      (content as LightMessageType[][]).map((c) => {
        if (c.length === 0) {
          return null;
        } else if (
          isArrayOf<LightMessageType, LightAgentMessageType>(
            c,
            (m: LightMessageType): m is LightAgentMessageType => {
              return m.type === "agent_message";
            }
          )
        ) {
          return c[c.length - 1];
        } else if (
          isArrayOf<LightMessageType, UserMessageTypeWithContentFragments>(
            c,
            isUserMessageTypeWithContentFragments
          )
        ) {
          return c[c.length - 1];
        } else {
          throw new Error(
            "Unexpected content type as everything should be array of same type. This should never happen."
          );
        }
      })
    );

    const conversationType: LightConversationType = {
      id: conversation.id,
      created: conversation.createdAt.getTime(),
      updated: conversation.updatedAt.getTime(),
      sId: conversation.sId,
      owner,
      title: conversation.title,
      visibility: conversation.visibility,
      depth: conversation.depth,
      triggerId: conversation.triggerSId,
      content: typeCheckedContent,
      actionRequired,
      unread: lastReadAt === null || conversation.updatedAt > lastReadAt,
      lastReadMs: lastReadAt?.getTime() ?? null,
      hasError: conversation.hasError,
      requestedSpaceIds: conversation.getRequestedSpaceIdsFromModel(),
      spaceId: conversation.space?.sId ?? null,
      metadata: conversation.metadata,
    };

    return new Ok(conversationType) as Result<
      V extends "light"
        ? LightConversationType
        : V extends "full"
          ? ConversationType
          : never,
      ConversationError
    >;
  } else {
    // TypeScript now knows messagesWithRank is MessageType[]
    const typeCheckedContent: (
      | AgentMessageType[]
      | UserMessageType[]
      | ContentFragmentType[]
    )[] = (content as MessageType[][]).map((c) => {
      if (c.length === 0) {
        return [];
      } else if (
        isArrayOf<MessageType, AgentMessageType>(c, isAgentMessageType)
      ) {
        return c.map((m) => m);
      } else if (
        isArrayOf<MessageType, UserMessageType>(c, isUserMessageType)
      ) {
        return c.map((m) => m);
      } else if (
        isArrayOf<MessageType, ContentFragmentType>(c, isContentFragmentType)
      ) {
        return c.map((m) => m);
      } else {
        throw new Error(
          "Unexpected content type as everything should be array of same type. This should never happen."
        );
      }
    });

    const conversationType: ConversationType = {
      id: conversation.id,
      created: conversation.createdAt.getTime(),
      updated: conversation.updatedAt.getTime(),
      sId: conversation.sId,
      owner,
      title: conversation.title,
      visibility: conversation.visibility,
      depth: conversation.depth,
      triggerId: conversation.triggerSId,
      content: typeCheckedContent,
      actionRequired,
      unread: lastReadAt === null || conversation.updatedAt > lastReadAt,
      lastReadMs: lastReadAt?.getTime() ?? null,
      hasError: conversation.hasError,

      requestedSpaceIds: conversation.getRequestedSpaceIdsFromModel(),
      spaceId: conversation.space?.sId ?? null,
      metadata: conversation.metadata,
    };

    return new Ok(conversationType) as Result<
      V extends "light"
        ? LightConversationType
        : V extends "full"
          ? ConversationType
          : never,
      ConversationError
    >;
  }
}
