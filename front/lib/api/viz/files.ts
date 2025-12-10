import { Authenticator } from "@app/lib/auth";
import {
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { MAX_CONVERSATION_DEPTH } from "@app/pages/api/v1/w/[wId]/assistant/conversations";
import type { LightWorkspaceType, Result } from "@app/types";
import { Err, Ok } from "@app/types";

/**
 * Check if conversationA is an ancestor of conversationB
 * Includes cycle detection and depth limiting
 */
async function isAncestorConversation(
  auth: Authenticator,
  conversationA: ConversationResource,
  conversationB: ConversationResource | ConversationModel,
  visited: Set<string> = new Set(),
  maxDepth: number = MAX_CONVERSATION_DEPTH
): Promise<boolean> {
  // Prevent infinite loops.
  if (visited.size >= maxDepth) {
    throw new Error("Maximum conversation depth exceeded");
  }

  // A conversation cannot be its own ancestor.
  if (conversationA.sId === conversationB.sId) {
    return false;
  }

  // Record the conversation as visited.
  if (visited.has(conversationB.sId)) {
    return false;
  }
  visited.add(conversationB.sId);

  const workspaceId = auth.getNonNullableWorkspace().id;

  // Get the first user message from conversation B.
  const firstUserMessage = await MessageModel.findOne({
    where: {
      conversationId: conversationB.id,
      workspaceId,
    },
    order: [
      ["rank", "ASC"],
      ["version", "ASC"],
    ],
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: true,
      },
    ],
  });

  // TODO(2025-11-24 PPUL): Rely on agenticOriginMessageId only once data has been backfilled
  const originMessageId =
    firstUserMessage?.userMessage?.userContextOriginMessageId ??
    firstUserMessage?.userMessage?.agenticOriginMessageId;
  if (!originMessageId) {
    return false;
  }

  // Find the origin message and its conversation.
  const originMessage = await MessageModel.findOne({
    where: {
      workspaceId,
      sId: originMessageId,
    },
    include: [
      {
        model: ConversationModel,
        as: "conversation",
        required: true,
      },
    ],
  });

  if (!originMessage?.conversation) {
    return false;
  }

  // Direct parent match.
  if (originMessage.conversation.sId === conversationA.sId) {
    return true;
  }

  // Recursively check parent.
  return isAncestorConversation(
    auth,
    conversationA,
    originMessage.conversation,
    visited,
    maxDepth
  );
}

/**
 * Check if a file can be accessed within a conversation context.
 *
 * This function handles two cases:
 * 1. Direct access: File belongs to the same conversation as the frame
 * 2. Hierarchical access: File belongs to a sub-conversation created via run_agent handovers
 *
 * For the hierarchical case, the current implementation requires traversing conversation chains by
 * following userContextOriginMessageId references, which is fragile and performance-intensive. This
 * depth checking logic is a temporary solution that will be simplified once the overall data model
 * is improved to better represent conversation relationships.
 *
 * Current pain points:
 * - Multiple database queries to traverse the hierarchy
 * - Manual cycle detection and depth limiting
 * - Complex permission filtering workarounds
 * - No direct foreign key relationships between parent/child conversations
 */
export async function canAccessFileInConversation(
  owner: LightWorkspaceType,
  file: FileResource,
  requestedConversationId: string
): Promise<Result<true, Error>> {
  const { useCase, useCaseMetadata } = file;
  const isSupportedUsecase =
    useCase === "tool_output" || useCase === "conversation";

  // Verify supported use case.
  if (!isSupportedUsecase) {
    return new Err(new Error("Unsupported file use case"));
  }

  if (!useCaseMetadata?.conversationId) {
    return new Err(new Error("File is not associated with a conversation"));
  }

  // Direct access, file belongs to the requested conversation.
  if (useCaseMetadata.conversationId === requestedConversationId) {
    return new Ok(true);
  }

  const auth = await Authenticator.internalBuilderForWorkspace(owner.sId);

  // We only need to verify if the conversation exists, but internalBuilderForWorkspace only has
  // global group access and can't see agents from other groups that this conversation might
  // reference.
  const requestedConversation = await ConversationResource.fetchById(
    auth,
    requestedConversationId,
    {
      dangerouslySkipPermissionFiltering: true,
    }
  );
  if (!requestedConversation) {
    return new Err(new Error("Requested conversation not found"));
  }

  // Check if file belongs to a conversation created through a sub agent run.
  const fileConversation = await ConversationResource.fetchById(
    auth,
    useCaseMetadata.conversationId
  );
  if (!fileConversation) {
    return new Err(new Error("File conversation not found"));
  }

  // Traverse up the conversation hierarchy of the file's conversation.
  const fileBelongsToSubConversation = await isAncestorConversation(
    auth,
    requestedConversation,
    fileConversation
  );

  if (fileBelongsToSubConversation) {
    return new Ok(true);
  }

  return new Err(new Error("Access to file denied"));
}
