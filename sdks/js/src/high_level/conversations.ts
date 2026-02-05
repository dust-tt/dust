import type { DustAPI } from "../index";
import { apiErrorToDustError } from "../errors";
import type { ConversationInfo, CreateConversationParams } from "./types";

function toConversationInfo(conversation: {
  sId: string;
  title: string | null;
  visibility: string;
  created: number;
}): ConversationInfo {
  return {
    id: conversation.sId,
    title: conversation.title,
    visibility: conversation.visibility,
    created: conversation.created,
    updated: conversation.created,
  };
}

export class ConversationsAPI {
  private _client: DustAPI;

  constructor(client: DustAPI) {
    this._client = client;
  }

  async create(
    params: CreateConversationParams = {}
  ): Promise<ConversationInfo> {
    const result = await this._client.createConversation({
      title: params.title ?? null,
      visibility: params.visibility ?? "unlisted",
    });

    if (result.isErr()) {
      throw apiErrorToDustError(result.error);
    }

    return toConversationInfo(result.value.conversation);
  }

  async get(conversationId: string): Promise<ConversationInfo> {
    const result = await this._client.getConversation({ conversationId });

    if (result.isErr()) {
      throw apiErrorToDustError(result.error);
    }

    return toConversationInfo(result.value);
  }

  async list(): Promise<ConversationInfo[]> {
    const result = await this._client.getConversations();

    if (result.isErr()) {
      throw apiErrorToDustError(result.error);
    }

    return result.value.map(toConversationInfo);
  }
}
