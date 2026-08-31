import { MCPError } from "@app/lib/actions/mcp_errors";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import {
  appendFilePathsHintToQuery,
  copyConversationFilesIntoSub,
  resolveFilePathsInParentScope,
} from "@app/lib/api/actions/servers/run_agent/file_paths";
import { isTransientNetworkError } from "@app/lib/api/actions/servers/run_agent/network_errors";
import type { ChildAgentBlob } from "@app/lib/api/actions/servers/run_agent/types";
import { isRunAgentResumeState } from "@app/lib/api/actions/servers/run_agent/types";
import {
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import { copySelectedConversationSpacesToChild } from "@app/lib/api/assistant/conversation/selected_spaces";
import { listAttachments } from "@app/lib/api/assistant/jit_utils";
import type { Authenticator } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { isUserMessageType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type {
  APIError,
  ConversationPublicType,
  DustAPI,
  PublicPostContentFragmentRequestBody,
  PublicPostMessagesRequestBody,
} from "@dust-tt/client";

/**
 * Determines if an error should be considered user-side.
 * User-side errors should not trigger alerts and their messages should be
 * surfaced to the model.
 */
function isUserSideError(error: APIError): boolean {
  return (
    error.type === "agent_inaccessible" ||
    error.type === "invalid_request_error" ||
    error.type === "plan_message_limit_exceeded" ||
    error.type === "rate_limit_error"
  );
}

async function cleanupSubConversationAfterSetupFailure(
  auth: Authenticator,
  conversationId: string
): Promise<void> {
  try {
    const conversation = await ConversationResource.fetchById(
      auth,
      conversationId
    );
    if (!conversation) {
      return;
    }

    const result = await destroyConversation(auth, { conversation });
    if (result.isErr()) {
      logger.error(
        { error: result.error, conversationId },
        "Failed to clean up sub-conversation after setup failure"
      );
    }
  } catch (error) {
    logger.error(
      { error, conversationId },
      "Failed to clean up sub-conversation after setup failure"
    );
  }
}

async function postMessageAndFetchConversation(
  api: DustAPI,
  {
    conversationId,
    message,
    onPostMessageError,
  }: {
    conversationId: string;
    message: PublicPostMessagesRequestBody;
    onPostMessageError?: () => Promise<void>;
  }
): Promise<
  Result<
    { conversation: ConversationPublicType; userMessageId: string },
    MCPError
  >
> {
  const messageRes = await api.postUserMessage({ conversationId, message });
  if (messageRes.isErr()) {
    const isUserSide = isUserSideError(messageRes.error);
    const isTransient = isTransientNetworkError(messageRes.error);
    if (isUserSide) {
      await onPostMessageError?.();
    }
    return new Err(
      new MCPError(
        isUserSide ? messageRes.error.message : "Failed to create message",
        {
          cause: messageRes.error,
          tracked: !isUserSide && !isTransient,
        }
      )
    );
  }

  const conversationRes = await api.getConversation({ conversationId });
  if (conversationRes.isErr()) {
    const isUserSide = isUserSideError(conversationRes.error);
    const isTransient = isTransientNetworkError(conversationRes.error);
    return new Err(
      new MCPError(
        isUserSide
          ? conversationRes.error.message
          : "Failed to get conversation",
        {
          cause: conversationRes.error,
          tracked: !isUserSide && !isTransient,
        }
      )
    );
  }

  return new Ok({
    conversation: conversationRes.value,
    userMessageId: messageRes.value.sId,
  });
}

export async function getOrCreateConversation(
  api: DustAPI,
  auth: Authenticator,
  agentLoopContext: AgentLoopRunContext,
  {
    childAgentBlob,
    childAgentId,
    mainAgent,
    originMessage,
    mainConversation,
    query,
    toolsetsToAdd,
    fileOrContentFragmentIds,
    filePaths,
    conversationId,
  }: {
    childAgentBlob: ChildAgentBlob;
    childAgentId: string;
    mainAgent: AgentLoopExecutionData["agentConfiguration"];
    originMessage: AgentLoopExecutionData["agentMessage"];
    mainConversation: AgentLoopExecutionData["conversation"];
    query: string;
    toolsetsToAdd: string[] | null;
    fileOrContentFragmentIds: string[] | null;
    filePaths: string[] | null;
    conversationId: string | null;
  }
): Promise<
  Result<
    {
      conversation: ConversationPublicType;
      isNewConversation: boolean;
      userMessageId: string;
    },
    MCPError
  >
> {
  const { agentMessage, stepContext } = agentLoopContext;

  const { resumeState } = stepContext;
  if (resumeState && isRunAgentResumeState(resumeState)) {
    const convRes = await api.getConversation({
      conversationId: resumeState.conversationId,
    });

    if (convRes.isErr()) {
      const isUserSide = isUserSideError(convRes.error);
      const isTransient = isTransientNetworkError(convRes.error);
      const message = isUserSide
        ? convRes.error.message
        : "Failed to get conversation";
      return new Err(
        new MCPError(message, {
          cause: convRes.error,
          tracked: !isUserSide && !isTransient,
        })
      );
    }

    return new Ok({
      conversation: convRes.value,
      isNewConversation: false,
      userMessageId: resumeState.userMessageId,
    });
  }

  // Resolve scoped file paths in the parent's auth/conversation scope. Any failure here surfaces
  // cleanly before the sub-conversation is created. `pod-{podId}/<rel>` paths are validated but not
  // copied (the Pod mount is shared across the Pod's conversations).
  // `conversation-{conversationId}/<rel>` paths are copied to the sub-conversation's mount once the sub exists.
  // A short hint is appended to the sub's first message so it knows which paths were forwarded;
  // the sub reads them through the files MCP server.
  let resolvedFilePaths: string[] = [];
  if (filePaths && filePaths.length > 0) {
    const resolvedFilePathsRes = await resolveFilePathsInParentScope(
      auth,
      mainConversation,
      filePaths
    );
    if (resolvedFilePathsRes.isErr()) {
      return resolvedFilePathsRes;
    }
    resolvedFilePaths = resolvedFilePathsRes.value;
  }

  const queryWithFilePaths = appendFilePathsHintToQuery(
    query,
    resolvedFilePaths
  );

  const contentFragments: PublicPostContentFragmentRequestBody[] = [];

  if (fileOrContentFragmentIds) {
    // Get all files from the current conversation and filter which one to pass to the sub agent
    const attachments = await listAttachments(auth, {
      conversation: mainConversation,
    });
    for (const attachment of attachments) {
      if (
        isFileAttachmentType(attachment) &&
        fileOrContentFragmentIds?.includes(attachment.fileId)
      ) {
        // Convert file attachment to content fragment
        contentFragments.push({
          title: attachment.title,
          fileId: attachment.fileId,
          url: null,
          context: null,
        });
      } else if (
        isContentNodeAttachmentType(attachment) &&
        fileOrContentFragmentIds?.includes(attachment.contentFragmentId)
      ) {
        // Convert content node attachment to content fragment
        contentFragments.push({
          title: attachment.title,
          nodeId: attachment.nodeId,
          nodeDataSourceViewId: attachment.nodeDataSourceViewId,
          context: null,
        });
      }
    }
  }

  let parentOrigin: UserMessageOrigin | null = null;
  const parentMessage = mainConversation.content
    .flat()
    .find((m) => m.sId === originMessage.parentMessageId);

  if (!parentMessage) {
    return new Err(new MCPError("Parent message not found."));
  }

  if (!isUserMessageType(parentMessage)) {
    return new Err(new MCPError("Parent message is not a user message."));
  }

  parentOrigin = parentMessage.context.origin ?? null;

  const makeSubAgentMessage = (
    type: "run_agent" | "agent_handover"
  ): PublicPostMessagesRequestBody => ({
    content: `${serializeMention({ name: childAgentBlob.name, sId: childAgentId })} ${queryWithFilePaths}`,
    mentions: [{ configurationId: childAgentId }],
    context: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      username: mainAgent.name,
      fullName: mainAgent.name,
      email: null,
      profilePictureUrl: mainAgent.pictureUrl,
      origin: parentOrigin,
      selectedMCPServerViewIds: toolsetsToAdd,
    },
    agenticMessageData: {
      // `run_agent` type will skip adding the conversation to the user history.
      type,
      originMessageId: originMessage.sId,
    },
    skipToolsValidation:
      type === "run_agent"
        ? (agentMessage.skipToolsValidation ?? false)
        : false,
  });

  if (conversationId) {
    const agenticMessageType =
      mainConversation.sId !== conversationId ? "run_agent" : "agent_handover";
    const result = await postMessageAndFetchConversation(api, {
      conversationId,
      message: makeSubAgentMessage(agenticMessageType),
    });
    if (result.isErr()) {
      return result;
    }

    return new Ok({
      ...result.value,
      isNewConversation: true,
    });
  }

  const convRes = await api.createConversation({
    title: `run_agent ${mainAgent.name} > ${childAgentBlob.name}`,
    visibility: "unlisted",
    depth: mainConversation.depth + 1,
    spaceId: mainConversation.spaceId ?? undefined,
    contentFragments,
  });

  if (convRes.isErr()) {
    const isUserSide = isUserSideError(convRes.error);
    const isTransient = isTransientNetworkError(convRes.error);

    logger.error(
      {
        error: convRes.error,
        stepContext,
        isTransient,
        isUserSide,
      },
      "Failed to create conversation"
    );

    const message = isUserSide
      ? convRes.error.message
      : "Failed to create conversation";
    return new Err(
      new MCPError(message, {
        cause: convRes.error,
        tracked: !isUserSide && !isTransient,
      })
    );
  }

  const { conversation } = convRes.value;

  if (
    !mainConversation.spaceId &&
    mainConversation.metadata?.useDatabaseFileSystem === true
  ) {
    const inheritRes = await ConversationResource.inheritDatabaseFileSystem(
      auth,
      conversation.sId
    );
    if (inheritRes.isErr()) {
      await cleanupSubConversationAfterSetupFailure(auth, conversation.sId);
      return new Err(
        new MCPError("Failed to inherit the parent filesystem", {
          cause: inheritRes.error,
        })
      );
    }
  }

  const selectedSpacesResult = await copySelectedConversationSpacesToChild(
    auth,
    {
      parentConversation: mainConversation,
      childConversationId: conversation.sId,
    }
  );
  if (selectedSpacesResult.isErr()) {
    await cleanupSubConversationAfterSetupFailure(auth, conversation.sId);
    return new Err(
      new MCPError("Failed to inherit selected Spaces", {
        cause: selectedSpacesResult.error,
      })
    );
  }

  const copyRes = await copyConversationFilesIntoSub(auth, {
    parentConversation: mainConversation,
    subConversationId: conversation.sId,
    filePaths: resolvedFilePaths,
  });
  if (copyRes.isErr()) {
    await cleanupSubConversationAfterSetupFailure(auth, conversation.sId);
    return copyRes;
  }

  const result = await postMessageAndFetchConversation(api, {
    conversationId: conversation.sId,
    message: makeSubAgentMessage("run_agent"),
    onPostMessageError: () =>
      cleanupSubConversationAfterSetupFailure(auth, conversation.sId),
  });
  if (result.isErr()) {
    return result;
  }

  return new Ok({
    ...result.value,
    isNewConversation: true,
  });
}
