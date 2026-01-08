import {
  DustAPI,
  type ConversationPublicType,
  type ConversationWithoutContentPublicType,
  type LightAgentConfigurationType,
  type UserMessageType,
  type AgentMessagePublicType,
  type PublicPostConversationsRequestBody,
  type PublicPostMessagesRequestBody,
  type Result,
  type APIError,
  Err,
  Ok,
} from "@dust-tt/client";

import { MobileAuthService } from "@/lib/services/auth";
import { storageService } from "@/lib/services/storage";
import { streamAgentAnswerRN } from "@/lib/services/streaming";

// Re-export types for backward compatibility
export type {
  ConversationPublicType as ConversationWithContent,
  ConversationWithoutContentPublicType as ConversationWithoutContent,
  LightAgentConfigurationType as LightAgentConfiguration,
  UserMessageType as UserMessage,
  AgentMessagePublicType as AgentMessage,
} from "@dust-tt/client";

export type AgentMention = {
  configurationId: string;
};

export type MessageContext = {
  timezone: string;
  username: string;
  email: string | null;
  fullName: string | null;
  profilePictureUrl: string | null;
  origin: "mobile";
};

export type CreateConversationRequest = {
  title?: string | null;
  visibility: "unlisted";
  message: {
    content: string;
    mentions: AgentMention[];
    context: MessageContext;
  };
};

export type PostMessageRequest = {
  content: string;
  mentions: AgentMention[];
  context: MessageContext;
};

export type CreateConversationResponse = {
  conversation: ConversationPublicType;
  message: UserMessageType;
};

export type PostMessageResponse = {
  message: UserMessageType;
  agentMessages: AgentMessagePublicType[];
};

// Streaming event types
export type StreamEvent =
  | { type: "user_message_new"; message: UserMessageType }
  | { type: "agent_message_new"; message: AgentMessagePublicType }
  | {
      type: "generation_tokens";
      text: string;
      classification: "tokens" | "chain_of_thought";
    }
  | { type: "agent_message_success"; message: AgentMessagePublicType }
  | { type: "user_message_error"; error: { code: string; message: string } }
  | { type: "agent_error"; error: { code: string; message: string } }
  | { type: "agent_action_success"; action: unknown };

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly type: string,
    message: string
  ) {
    super(message);
  }
}

const authService = new MobileAuthService(storageService);

// Simple console logger for mobile
const mobileLogger = {
  info: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

function createDustApi(dustDomain: string, workspaceId: string): DustAPI {
  return new DustAPI(
    { url: dustDomain },
    {
      apiKey: () => authService.getAccessToken(),
      workspaceId,
      extraHeaders: {
        "X-Request-Origin": "mobile",
      },
    },
    mobileLogger
  );
}

function mapApiError(error: APIError): ApiError {
  return new ApiError(500, error.type, error.message);
}

export class DustApi {
  async getConversations(
    dustDomain: string,
    workspaceId: string
  ): Promise<Result<ConversationWithoutContentPublicType[], ApiError>> {
    const api = createDustApi(dustDomain, workspaceId);
    const result = await api.getConversations();

    if (result.isErr()) {
      return new Err(mapApiError(result.error));
    }

    return new Ok(result.value);
  }

  async getConversation(
    dustDomain: string,
    workspaceId: string,
    conversationId: string
  ): Promise<Result<ConversationPublicType, ApiError>> {
    const api = createDustApi(dustDomain, workspaceId);
    const result = await api.getConversation({ conversationId });

    if (result.isErr()) {
      return new Err(mapApiError(result.error));
    }

    return new Ok(result.value);
  }

  async createConversation(
    dustDomain: string,
    workspaceId: string,
    request: CreateConversationRequest
  ): Promise<Result<CreateConversationResponse, ApiError>> {
    const api = createDustApi(dustDomain, workspaceId);

    const body: PublicPostConversationsRequestBody = {
      title: request.title ?? null,
      visibility: request.visibility,
      message: {
        content: request.message.content,
        mentions: request.message.mentions,
        context: request.message.context,
      },
    };

    const result = await api.createConversation(body);

    if (result.isErr()) {
      return new Err(mapApiError(result.error));
    }

    return new Ok({
      conversation: result.value.conversation,
      message: result.value.message,
    });
  }

  async getAgentConfigurations(
    dustDomain: string,
    workspaceId: string
  ): Promise<Result<LightAgentConfigurationType[], ApiError>> {
    const api = createDustApi(dustDomain, workspaceId);
    const result = await api.getAgentConfigurations({});

    if (result.isErr()) {
      return new Err(mapApiError(result.error));
    }

    return new Ok(result.value);
  }

  async postMessage(
    dustDomain: string,
    workspaceId: string,
    conversationId: string,
    request: PostMessageRequest
  ): Promise<Result<PostMessageResponse, ApiError>> {
    const api = createDustApi(dustDomain, workspaceId);

    const message: PublicPostMessagesRequestBody = {
      content: request.content,
      mentions: request.mentions,
      context: request.context,
    };

    const result = await api.postUserMessage({ conversationId, message });

    if (result.isErr()) {
      return new Err(mapApiError(result.error));
    }

    // The SDK returns just the user message, agent messages come via streaming
    return new Ok({
      message: result.value,
      agentMessages: [],
    });
  }

  async *streamAgentAnswer(
    dustDomain: string,
    workspaceId: string,
    conversationId: string,
    userMessageId: string,
    signal?: AbortSignal
  ): AsyncGenerator<StreamEvent, void, unknown> {
    // First, get the conversation to find the agent message that's responding to our user message
    const api = createDustApi(dustDomain, workspaceId);
    const convResult = await api.getConversation({ conversationId });

    if (convResult.isErr()) {
      throw new ApiError(500, convResult.error.type, convResult.error.message);
    }

    // Find the agent message with parentMessageId === userMessageId
    const agentMessage = convResult.value.content
      .flat()
      .find(
        (m): m is AgentMessagePublicType =>
          m.type === "agent_message" && m.parentMessageId === userMessageId
      );

    if (!agentMessage) {
      throw new ApiError(404, "not_found", "Agent message not found");
    }

    // Use React Native compatible streaming with the agent message sId
    const stream = streamAgentAnswerRN(
      dustDomain,
      workspaceId,
      conversationId,
      agentMessage.sId, // Use agent message sId, not user message sId
      () => authService.getAccessToken(),
      signal
    );

    for await (const event of stream) {
      yield event;
    }
  }
}

export const dustApi = new DustApi();
