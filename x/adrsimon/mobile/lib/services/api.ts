import type {
  AgentMessage,
  ConversationWithContent,
  ConversationWithoutContent,
  GetAgentConfigurationsResponse,
  GetConversationResponse,
  GetConversationsResponse,
  LightAgentConfiguration,
  UserMessage,
} from "@/lib/types/conversations";
import { normalizeError } from "@/lib/utils/errors";
import type { Result } from "@/lib/services/auth";
import { MobileAuthService } from "@/lib/services/auth";
import { storageService } from "@/lib/services/storage";

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
  conversation: ConversationWithContent;
  message: UserMessage;
};

export type PostMessageResponse = {
  message: UserMessage;
  agentMessages: AgentMessage[];
};

// Streaming event types
export type StreamEvent =
  | { type: "user_message_new"; message: UserMessage }
  | { type: "agent_message_new"; message: AgentMessage }
  | {
      type: "generation_tokens";
      text: string;
      classification: "tokens" | "chain_of_thought";
    }
  | { type: "agent_message_success"; message: AgentMessage }
  | { type: "user_message_error"; error: { code: string; message: string } }
  | { type: "agent_error"; error: { code: string; message: string } }
  | { type: "agent_action_success"; action: unknown };

function Ok<T>(value: T): Result<T, never> {
  return { isOk: true, value };
}

function Err<E>(error: E): Result<never, E> {
  return { isOk: false, error };
}

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

export class DustApi {
  private async request<T>(
    dustDomain: string,
    workspaceId: string,
    path: string,
    options: RequestInit = {}
  ): Promise<Result<T, ApiError>> {
    const accessToken = await authService.getAccessToken();
    if (!accessToken) {
      return Err(new ApiError(401, "not_authenticated", "No access token"));
    }

    let response: Response;
    try {
      response = await fetch(`${dustDomain}/api/v1/w/${workspaceId}/${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Request-Origin": "mobile",
          ...options.headers,
        },
      });
    } catch (err) {
      return Err(new ApiError(0, "network_error", normalizeError(err).message));
    }

    const data = await response.json();

    if (!response.ok) {
      return Err(
        new ApiError(
          response.status,
          data.error?.type ?? "unknown_error",
          data.error?.message ?? "Request failed"
        )
      );
    }

    return Ok(data as T);
  }

  async getConversations(
    dustDomain: string,
    workspaceId: string
  ): Promise<Result<ConversationWithoutContent[], ApiError>> {
    const result = await this.request<GetConversationsResponse>(
      dustDomain,
      workspaceId,
      "assistant/conversations"
    );

    if (!result.isOk) {
      return result;
    }

    return Ok(result.value.conversations);
  }

  async getConversation(
    dustDomain: string,
    workspaceId: string,
    conversationId: string
  ): Promise<Result<ConversationWithContent, ApiError>> {
    const result = await this.request<GetConversationResponse>(
      dustDomain,
      workspaceId,
      `assistant/conversations/${conversationId}`
    );

    if (!result.isOk) {
      return result;
    }

    return Ok(result.value.conversation);
  }

  async createConversation(
    dustDomain: string,
    workspaceId: string,
    request: CreateConversationRequest
  ): Promise<Result<CreateConversationResponse, ApiError>> {
    return this.request<CreateConversationResponse>(
      dustDomain,
      workspaceId,
      "assistant/conversations",
      {
        method: "POST",
        body: JSON.stringify(request),
      }
    );
  }

  async getAgentConfigurations(
    dustDomain: string,
    workspaceId: string
  ): Promise<Result<LightAgentConfiguration[], ApiError>> {
    const result = await this.request<GetAgentConfigurationsResponse>(
      dustDomain,
      workspaceId,
      "assistant/agent_configurations"
    );

    if (!result.isOk) {
      return result;
    }

    return Ok(result.value.agentConfigurations);
  }

  async postMessage(
    dustDomain: string,
    workspaceId: string,
    conversationId: string,
    request: PostMessageRequest
  ): Promise<Result<PostMessageResponse, ApiError>> {
    return this.request<PostMessageResponse>(
      dustDomain,
      workspaceId,
      `assistant/conversations/${conversationId}/messages`,
      {
        method: "POST",
        body: JSON.stringify(request),
      }
    );
  }

  async *streamAgentAnswer(
    dustDomain: string,
    workspaceId: string,
    conversationId: string,
    userMessageId: string,
    signal?: AbortSignal
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const accessToken = await authService.getAccessToken();
    if (!accessToken) {
      throw new ApiError(401, "not_authenticated", "No access token");
    }

    const url = `${dustDomain}/api/v1/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${userMessageId}/events`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Request-Origin": "mobile",
      },
      signal,
    });

    if (!response.ok) {
      const data = await response.json();
      throw new ApiError(
        response.status,
        data.error?.type ?? "unknown_error",
        data.error?.message ?? "Stream request failed"
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ApiError(500, "stream_error", "No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr && jsonStr !== "[DONE]") {
              try {
                const parsed = JSON.parse(jsonStr);
                // Events are wrapped: { eventId: "...", data: <actual event> }
                const event = parsed.data as StreamEvent;
                if (event && event.type) {
                  yield event;
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export const dustApi = new DustApi();
