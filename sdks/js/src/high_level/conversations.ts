import type {
  APIError,
  ConversationPublicType,
  ConversationWithoutContentPublicType,
  CreateConversationResponseType,
  PublicPostConversationsRequestBody,
  Result,
} from "../types";
import { toDustAPIError } from "./errors";

interface DustAPIClient {
  createConversation(
    args: PublicPostConversationsRequestBody & {
      params?: Record<string, string>;
    }
  ): Promise<Result<CreateConversationResponseType, APIError>>;
  getConversation(args: {
    conversationId: string;
  }): Promise<Result<ConversationPublicType, APIError>>;
  getConversations(): Promise<
    Result<ConversationWithoutContentPublicType[], APIError>
  >;
}

function unwrapResult<T>(result: Result<T, APIError>): T {
  if (result.isErr()) {
    throw toDustAPIError(result.error);
  }
  return result.value;
}

export class ConversationsAPI {
  private readonly client: DustAPIClient;

  constructor(client: DustAPIClient) {
    this.client = client;
  }

  async create(
    params: PublicPostConversationsRequestBody & {
      params?: Record<string, string>;
    }
  ): Promise<CreateConversationResponseType> {
    const res = await this.client.createConversation(params);
    return unwrapResult(res);
  }

  async get({
    conversationId,
  }: {
    conversationId: string;
  }): Promise<ConversationPublicType> {
    const res = await this.client.getConversation({ conversationId });
    return unwrapResult(res);
  }

  async list(): Promise<ConversationWithoutContentPublicType[]> {
    const res = await this.client.getConversations();
    return unwrapResult(res);
  }
}
