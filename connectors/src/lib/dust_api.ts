import { createParser } from "eventsource-parser";
import * as t from "io-ts";

import { ModelId } from "@connectors/lib/models";
import { Err, Ok, Result } from "@connectors/lib/result";
import logger from "@connectors/logger/logger";
import { ConnectorProvider } from "@connectors/types/connector";

type DataSourceVisibility = "public" | "private";

type DataSourceType = {
  name: string;
  description?: string;
  visibility: DataSourceVisibility;
  config?: string;
  dustAPIProjectId: string;
  connectorId?: string;
  connectorProvider?: ConnectorProvider;
};

const { DUST_API = "https://dust.tt" } = process.env;

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

type ChatRetrievedDocumentType = {
  dataSourceId: string;
  sourceUrl: string;
  documentId: string;
  timestamp: string;
  tags: string[];
  score: number;
  chunks: {
    text: string;
    offset: number;
    score: number;
  }[];
};

type MessageFeedbackStatus = "positive" | "negative" | null;

type MessageRole = "user" | "retrieval" | "assistant" | "error";
type ChatMessageType = {
  sId: string;
  role: MessageRole;
  message?: string; // for `user`, `assistant` and `error` messages
  retrievals?: ChatRetrievedDocumentType[]; // for `retrieval` messages
  query?: string; // for `retrieval` messages (not persisted)
  feedback?: MessageFeedbackStatus;
};

type ChatSessionType = {
  id: number;
  userId: number;
  created: number;
  sId: string;
  title?: string;
  messages?: ChatMessageType[];
  visibility: string;
};

// Event sent when the session is initially created.
type ChatSessionCreateEvent = {
  type: "chat_session_create";
  session: ChatSessionType;
};

// Event sent when we know what will be the type of the next message. It is sent initially when the
// user message is created for consistency and then each time we know we're going for a retrieval or
// an assistant response.
type ChatMessageTriggerEvent = {
  type: "chat_message_trigger";
  role: MessageRole;
  // We might want to add some data here in the future e.g including
  // information about the query being used in the case of retrieval.
};

// Event sent once the message is fully constructed.
type ChatMessageCreateEvent = {
  type: "chat_message_create";
  message: ChatMessageType;
};

// Event sent when receiving streamed response from the model.
type ChatMessageTokensEvent = {
  type: "chat_message_tokens";
  messageId: string;
  text: string;
};

// Event sent when the session is updated (eg title is set).
export type ChatSessionUpdateEvent = {
  type: "chat_session_update";
  session: ChatSessionType;
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

const PostMessagesRequestBodySchemaIoTs = t.type({
  content: t.string,
  mentions: t.array(
    t.union([
      t.type({ configurationId: t.string }),
      t.type({
        provider: t.string,
        providerId: t.string,
      }),
    ])
  ),
  context: t.type({
    timezone: t.string,
    username: t.string,
    fullName: t.union([t.string, t.null]),
    email: t.union([t.string, t.null]),
    profilePictureUrl: t.union([t.string, t.null]),
  }),
});

const PostConversationsRequestBodySchemaIoTs = t.type({
  title: t.union([t.string, t.null]),
  visibility: t.union([
    t.literal("unlisted"),
    t.literal("workspace"),
    t.literal("deleted"),
  ]),
  message: PostMessagesRequestBodySchemaIoTs,
});

type PostConversationsRequestBodySchema = t.TypeOf<
  typeof PostConversationsRequestBodySchemaIoTs
>;

export type PostMessagesRequestBodySchema = t.TypeOf<
  typeof PostMessagesRequestBodySchemaIoTs
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

export type ConversationVisibility = "unlisted" | "workspace" | "deleted";

/**
 *  Expresses limits for usage of the product Any positive number enforces the limit, -1 means no
 *  limit. If the limit is undefined we revert to the default limit.
 * */
export type LimitsType = {
  dataSources: {
    count: number;
    documents: { count: number; sizeMb: number };
    managed: boolean;
  };
  largeModels?: boolean;
};

export type PlanType = {
  limits: LimitsType;
};

export type RoleType = "admin" | "builder" | "user" | "none";

export type WorkspaceType = {
  id: ModelId;
  sId: string;
  name: string;
  allowedDomain: string | null;
  role: RoleType;
  plan: PlanType;
  upgradedAt: number | null;
};

/**
 * Mentions
 */

export type AgentMention = {
  configurationId: string;
};

export type UserMention = {
  provider: string;
  providerId: string;
};

export type MentionType = AgentMention | UserMention;

export type UserProviderType = "github" | "google";

export type UserType = {
  id: ModelId;
  provider: UserProviderType;
  providerId: string;
  username: string;
  email: string;
  name: string;
  image: string | null;
  workspaces: WorkspaceType[];
  isDustSuperUser: boolean;
};

/**
 * User messages
 */

export type UserMessageContext = {
  username: string;
  timezone: string;
  fullName: string | null;
  email: string | null;
  profilePictureUrl: string | null;
};

export type MessageVisibility = "visible" | "deleted";

export type UserMessageType = {
  id: ModelId;
  type: "user_message";
  sId: string;
  visibility: MessageVisibility;
  version: number;
  user: UserType | null;
  mentions: MentionType[];
  content: string;
  context: UserMessageContext;
};
export type AgentMessageStatus = "created" | "succeeded" | "failed";
/**
 * Both `action` and `message` are optional (we could have a no-op agent basically).
 *
 * Since `action` and `message` are bundled together, it means that we will only be able to retry
 * them together in case of error of either. We store an error only here whether it's an error
 * coming from the action or from the message generation.
 */
export type AgentMessageType = {
  id: ModelId;
  type: "agent_message";
  sId: string;
  visibility: MessageVisibility;
  version: number;
  parentMessageId: string | null;

  // configuration: AgentConfigurationType;
  status: AgentMessageStatus;
  // action: AgentActionType | null;
  content: string | null;
  // feedbacks: UserFeedbackType[];
  error: {
    code: string;
    message: string;
  } | null;
};

export type ConversationType = {
  id: ModelId;
  created: number;
  sId: string;
  owner: WorkspaceType;
  title: string | null;
  visibility: ConversationVisibility;
  content: (UserMessageType[] | AgentMessageType[])[];
};

/**
 * This help functions process a streamed response in the format of the Dust API for running
 * streamed apps.
 *
 * @param res an HTTP response ready to be consumed as a stream
 */
export async function processStreamedChatResponse(res: Response) {
  if (!res.ok || !res.body) {
    return new Err({
      type: "dust_api_error",
      message: `Error running streamed app: status_code=${
        res.status
      }  - message=${await res.text()}`,
    });
  }

  let pendingEvents: (
    | ChatMessageTriggerEvent
    | ChatSessionCreateEvent
    | ChatMessageCreateEvent
    | ChatMessageTokensEvent
    | ChatSessionUpdateEvent
  )[] = [];

  const parser = createParser((event) => {
    if (event.type === "event") {
      if (event.data) {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "chat_session_create": {
              pendingEvents.push(data as ChatSessionCreateEvent);
              break;
            }
            case "chat_message_trigger": {
              pendingEvents.push(data as ChatMessageTriggerEvent);
              break;
            }
            case "chat_message_create": {
              pendingEvents.push(data as ChatMessageCreateEvent);
              break;
            }
            case "chat_message_tokens": {
              pendingEvents.push(data as ChatMessageTokensEvent);
              break;
            }
            case "chat_session_update": {
              pendingEvents.push(data as ChatSessionUpdateEvent);
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

/**
 * This help functions process a streamed response in the format of the Dust API for running
 * streamed apps.
 *
 * @param res an HTTP response ready to be consumed as a stream
 */
export async function processCreateConversationEvents(res: Response) {
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

export class DustAPI {
  _credentials: DustAPICredentials;

  /**
   * @param credentials DustAPICrededentials
   */
  constructor(credentials: DustAPICredentials) {
    this._credentials = credentials;
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
      `${DUST_API}/api/v1/w/${workspaceId}/data_sources`,
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

  async createConversation(
    title: string | null,
    visibility: ConversationVisibility,
    message: PostMessagesRequestBodySchema
  ) {
    const requestPayload: PostConversationsRequestBodySchema = {
      title: null,
      visibility,
      message,
    };

    const res = await fetch(
      `${DUST_API}/api/v1/w/${this.workspaceId()}/assistant/conversations`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this._credentials.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      }
    );

    const json = await res.json();
    if (json.error) {
      return new Err(json.error as DustAPIErrorResponse);
    }
    const conv = json.conversation as { sId: string };
    const agentMessageRes: Result<AgentMessageType, Error> =
      await (async () => {
        // looping 10 times to get the first agent message, we should listen on conversation stream
        // but this works for now as we have only one answer and are under time pressure.
        for (let i = 0; i < 10; i++) {
          const conversation = await this.getConversation(conv.sId);
          if (conversation.isOk()) {
            const agentMessage = conversation.value.content
              .flat()
              .filter((m) => {
                return m.type === "agent_message";
              });
            if (agentMessage.length > 0) {
              return new Ok(agentMessage[0] as AgentMessageType);
            }
          }
          await new Promise((r) => setTimeout(r, 1000));
        }

        return new Err(
          new Error(
            `Timeout waiting for agent message for conversation ${conv.sId}`
          )
        );
      })();

    if (agentMessageRes.isErr()) {
      return agentMessageRes;
    }

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this._credentials.apiKey}`,
    };

    const streamRes = await fetch(
      `${DUST_API}/api/v1/w/${this.workspaceId()}/assistant/conversations/${
        conv.sId
      }/messages/${agentMessageRes.value.sId}/events`,
      {
        method: "GET",
        headers: headers,
      }
    );

    return new Ok({
      stream: processCreateConversationEvents(streamRes),
      conversation: conv,
    });
  }

  async getConversation(conversationid: string) {
    const res = await fetch(
      `${DUST_API}/api/v1/w/${this.workspaceId()}/assistant/conversations/${conversationid}`,
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
}
