import {
  AgentActionType,
  AgentConfigurationType,
  AgentMessageType,
  ContentFragmentType,
  ConversationType,
  DataSourceType,
  PublicPostContentFragmentRequestBodySchema,
  PublicPostMessagesRequestBodySchema,
  UserMessageType,
} from "@dust-tt/types";
import { createParser } from "eventsource-parser";
import * as t from "io-ts";

import { Err, Ok, Result } from "@connectors/lib/result";
import logger from "@connectors/logger/logger";

const { DUST_FRONT_API } = process.env;

type DustAPIErrorResponse = {
  type: string;
  message: string;
};

type DustAppRunErrorEvent = {
  type: "error";
  content: {
    code: string;
    message: string;
  };
};

type DustAPICredentials = {
  apiKey: string;
  workspaceId: string;
};

export type AgentActionSuccessEvent = {
  type: "agent_action_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: AgentActionType;
};

// Event sent when tokens are streamed as the the agent is generating a message.
export type GenerationTokensEvent = {
  type: "generation_tokens";
  created: number;
  configurationId: string;
  messageId: string;
  text: string;
};

// Event sent once the generation is completed.
export type AgentGenerationSuccessEvent = {
  type: "agent_generation_success";
  created: number;
  configurationId: string;
  messageId: string;
  text: string;
};

const PostConversationsRequestBodySchemaIoTs = t.type({
  title: t.union([t.string, t.null]),
  visibility: t.union([
    t.literal("unlisted"),
    t.literal("workspace"),
    t.literal("deleted"),
  ]),
  message: t.union([PublicPostMessagesRequestBodySchema, t.undefined]),
  contentFragment: t.union([
    PublicPostContentFragmentRequestBodySchema,
    t.undefined,
  ]),
});

type PostConversationsRequestBodySchema = t.TypeOf<
  typeof PostConversationsRequestBodySchemaIoTs
>;

export type PostMessagesRequestBodySchema = t.TypeOf<
  typeof PublicPostMessagesRequestBodySchema
>;

export type PostContentFragmentRequestBody = t.TypeOf<
  typeof PublicPostContentFragmentRequestBodySchema
>;

// Event sent when the user message is created.
export type UserMessageErrorEvent = {
  type: "user_message_error";
  created: number;
  error: {
    code: string;
    message: string;
  };
};

// Generic event sent when an error occured (whether it's during the action or the message generation).
export type AgentErrorEvent = {
  type: "agent_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type GenerationSuccessEvent = {
  type: "generation_success";
  created: number;
  configurationId: string;
  messageId: string;
  text: string;
};
/**
 * User messages
 */

export class DustAPI {
  _credentials: DustAPICredentials;

  /**
   * @param credentials DustAPICrededentials
   */
  constructor(credentials: DustAPICredentials) {
    this._credentials = credentials;
    if (!DUST_FRONT_API) {
      throw new Error("Missing DUST_FRONT_API env variable.");
    }
  }

  workspaceId(): string {
    return this._credentials.workspaceId;
  }

  /**
   * This actions talks to the Dust production API to retrieve the list of data sources of the
   * specified workspace id.
   *
   * @param workspaceId string the workspace id to fetch data sources for
   */
  async getDataSources(workspaceId: string) {
    const res = await fetch(
      `${DUST_FRONT_API}/api/v1/w/${workspaceId}/data_sources`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this._credentials.apiKey}`,
        },
      }
    );

    const json = await res.json();
    if (json.error) {
      return new Err(json.error as DustAPIErrorResponse);
    }
    return new Ok(json.data_sources as DataSourceType[]);
  }

  // When creating a conversation with a user message, the API returns only after the user message
  // was created (and if applicable the assocaited agent messages).
  async createConversation({
    title,
    visibility,
    message,
    contentFragment,
  }: PostConversationsRequestBodySchema): Promise<
    Result<
      { conversation: ConversationType; message: UserMessageType },
      DustAPIErrorResponse
    >
  > {
    const res = await fetch(
      `${DUST_FRONT_API}/api/v1/w/${this.workspaceId()}/assistant/conversations`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this._credentials.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          visibility,
          message,
          contentFragment,
        }),
      }
    );

    const json = await res.json();
    if (json.error) {
      return new Err(json.error as DustAPIErrorResponse);
    }

    return new Ok(
      json as { conversation: ConversationType; message: UserMessageType }
    );
  }

  async postUserMessage({
    conversationId,
    message,
  }: {
    conversationId: string;
    message: PostMessagesRequestBodySchema;
  }) {
    const res = await fetch(
      `${DUST_FRONT_API}/api/v1/w/${this.workspaceId()}/assistant/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this._credentials.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...message,
        }),
      }
    );

    const json = await res.json();
    if (json.error) {
      return new Err(json.error as DustAPIErrorResponse);
    }

    return new Ok(json.message as UserMessageType);
  }

  async streamAgentMessageEvents({
    conversation,
    message,
  }: {
    conversation: ConversationType;
    message: AgentMessageType;
  }) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this._credentials.apiKey}`,
    };

    const res = await fetch(
      `${DUST_FRONT_API}/api/v1/w/${this.workspaceId()}/assistant/conversations/${
        conversation.sId
      }/messages/${message.sId}/events`,
      {
        method: "GET",
        headers: headers,
      }
    );

    if (!res.ok || !res.body) {
      return new Err({
        type: "dust_api_error",
        message: `Error running streamed app: status_code=${
          res.status
        }  - message=${await res.text()}`,
      });
    }

    let pendingEvents: (
      | UserMessageErrorEvent
      | AgentErrorEvent
      | AgentActionSuccessEvent
      | GenerationTokensEvent
      | AgentGenerationSuccessEvent
    )[] = [];

    const parser = createParser((event) => {
      if (event.type === "event") {
        if (event.data) {
          try {
            const data = JSON.parse(event.data).data;
            switch (data.type) {
              case "user_message_error": {
                pendingEvents.push(data as UserMessageErrorEvent);
                break;
              }
              case "agent_error": {
                pendingEvents.push(data as AgentErrorEvent);
                break;
              }
              case "agent_action_success": {
                pendingEvents.push(data as AgentActionSuccessEvent);
                break;
              }
              case "generation_tokens": {
                pendingEvents.push(data as GenerationTokensEvent);
                break;
              }
              case "agent_generation_success": {
                pendingEvents.push(data as AgentGenerationSuccessEvent);
                break;
              }
            }
          } catch (err) {
            logger.error({ error: err }, "Failed parsing chunk from Dust API");
          }
        }
      }
    });

    const reader = res.body.getReader();

    const streamEvents = async function* () {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          parser.feed(new TextDecoder().decode(value));
          for (const event of pendingEvents) {
            yield event;
          }
          pendingEvents = [];
        }
      } catch (e) {
        yield {
          type: "error",
          content: {
            code: "stream_error",
            message: "Error streaming chunks",
          },
        } as DustAppRunErrorEvent;
        logger.error(
          {
            error: e,
          },
          "Error streaming chunks."
        );
      } finally {
        reader.releaseLock();
      }
    };

    return new Ok({ eventStream: streamEvents() });
  }

  async getConversation({ conversationId }: { conversationId: string }) {
    const res = await fetch(
      `${DUST_FRONT_API}/api/v1/w/${this.workspaceId()}/assistant/conversations/${conversationId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this._credentials.apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const json = await res.json();

    if (json.error) {
      return new Err(json.error as DustAPIErrorResponse);
    }
    return new Ok(json.conversation as ConversationType);
  }

  async getAgentConfigurations() {
    const res = await fetch(
      `${DUST_FRONT_API}/api/v1/w/${this.workspaceId()}/assistant/agent_configurations`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this._credentials.apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const json = await res.json();

    if (json.error) {
      return new Err(json.error as DustAPIErrorResponse);
    }
    return new Ok(json.agentConfigurations as AgentConfigurationType[]);
  }

  async postContentFragment({
    conversationId,
    contentFragment,
  }: {
    conversationId: string;
    contentFragment: PostContentFragmentRequestBody;
  }) {
    const res = await fetch(
      `${DUST_FRONT_API}/api/v1/w/${this.workspaceId()}/assistant/conversations/${conversationId}/content_fragments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this._credentials.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...contentFragment,
        }),
      }
    );

    const json = await res.json();

    if (json.error) {
      return new Err(json.error as DustAPIErrorResponse);
    }
    return new Ok(json.contentFragment as ContentFragmentType);
  }
}
