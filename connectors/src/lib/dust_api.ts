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

/**
 * Agent messages
 */

export type AgentActionType = RetrievalActionType;

export type RetrievalActionType = {
  type: "retrieval_action";
  params: {
    relativeTimeFrame: TimeFrame | null;
    query: string | null;
    topK: number;
  };
  documents: RetrievalDocumentType[] | null;
};

export type RetrievalDocumentType = {
  dataSourceWorkspaceId: string;
  dataSourceId: string;
  sourceUrl: string | null;
  documentId: string;
  reference: string; // Short random string so that the model can refer to the document.
  timestamp: number;
  tags: string[];
  score: number | null;
  chunks: {
    text: string;
    offset: number;
    score: number | null;
  }[];
};

export type TimeFrame = {
  duration: number;
  unit: TimeframeUnit;
};

export const TIME_FRAME_UNITS = [
  "hour",
  "day",
  "week",
  "month",
  "year",
] as const;

export type TimeframeUnit = (typeof TIME_FRAME_UNITS)[number];

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
  action: AgentActionType | null;
  content: string | null;
  error: {
    code: string;
    message: string;
  } | null;
};

/**
 * Conversation
 */

export type ConversationType = {
  id: ModelId;
  created: number;
  sId: string;
  owner: WorkspaceType;
  title: string | null;
  visibility: ConversationVisibility;
  content: (UserMessageType[] | AgentMessageType[])[];
};

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

  // When creating a conversation with a user message, the API returns only after the user message
  // was created (and if applicable the assocaited agent messages).
  async createConversation({
    title,
    visibility,
    message,
  }: PostConversationsRequestBodySchema): Promise<
    Result<ConversationType, DustAPIErrorResponse>
  > {
    const res = await fetch(
      `${DUST_API}/api/v1/w/${this.workspaceId()}/assistant/conversations`,
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
        }),
      }
    );

    const json = await res.json();
    if (json.error) {
      return new Err(json.error as DustAPIErrorResponse);
    }

    return new Ok(json.conversation as ConversationType);
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
      `${DUST_API}/api/v1/w/${this.workspaceId()}/assistant/conversations/${
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

  async getConversation(conversationId: string) {
    const res = await fetch(
      `${DUST_API}/api/v1/w/${this.workspaceId()}/assistant/conversations/${conversationId}`,
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
