import { createParser } from "eventsource-parser";

import { Err, Ok } from "@connectors/lib/result";
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
  userUpsertable: boolean;
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

  async newChatStreamed(userMessage: string, timezone: string) {
    const url = `${DUST_API}/api/v1/w/${this.workspaceId()}/chats`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this._credentials.apiKey}`,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        user_message: userMessage,
        timezone: timezone,
      }),
    });

    return processStreamedChatResponse(res);
  }
}
