import { createParser } from "eventsource-parser";
import * as t from "io-ts";

import {
  PublicPostContentFragmentRequestBodySchema,
  PublicPostConversationsRequestBodySchema,
  PublicPostMessagesRequestBodySchema,
} from "../../front/api_handlers/public/assistant";
import { LightAgentConfigurationType } from "../../front/assistant/agent";
import {
  AgentMessageType,
  ContentFragmentType,
  ConversationType,
  UserMessageType,
} from "../../front/assistant/conversation";
import { DataSourceType } from "../../front/data_source";
import { Err, Ok, Result } from "../../front/lib/result";
import { RunType } from "../../front/run";
import { LoggerInterface } from "../../shared/logger";
import {
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationSuccessEvent,
} from "./api/assistant/agent";
import { UserMessageErrorEvent } from "./api/assistant/conversation";
import { GenerationTokensEvent } from "./api/assistant/generation";

const { DUST_PROD_API = "https://dust.tt", NODE_ENV } = process.env;

export type DustAPIErrorResponse = {
  type: string;
  message: string;
};

export type DustAppType = {
  workspaceId: string;
  appId: string;
  appHash: string;
};

export type DustAppConfigType = {
  [key: string]: unknown;
};

type DustAppRunErroredEvent = {
  type: "error";
  content: {
    code: string;
    message: string;
  };
};

export type DustAppRunRunStatusEvent = {
  type: "run_status";
  content: {
    status: "running" | "succeeded" | "errored";
    run_id: string;
  };
};

export type DustAppRunBlockStatusEvent = {
  type: "block_status";
  content: {
    block_type: string;
    name: string;
    status: "running" | "succeeded" | "errored";
    success_count: number;
    error_count: number;
  };
};

export type DustAppRunBlockExecutionEvent = {
  type: "block_execution";
  content: {
    block_type: string;
    block_name: string;
    execution: {
      value: unknown | null;
      error: string | null;
      meta: unknown | null;
    }[][];
  };
};

export type DustAppRunFinalEvent = {
  type: "final";
};

export type DustAppRunTokensEvent = {
  type: "tokens";
  content: {
    block_type: string;
    block_name: string;
    input_index: number;
    map: {
      name: string;
      iteration: number;
    } | null;
    tokens: {
      text: string;
      tokens?: string[];
      logprobs?: number[];
    };
  };
};

export type DustAppRunFunctionCallEvent = {
  type: "function_call";
  content: {
    block_type: string;
    block_name: string;
    input_index: number;
    map: {
      name: string;
      iteration: number;
    } | null;
    function_call: {
      name: string;
    };
  };
};

export type DustAppRunFunctionCallArgumentsTokensEvent = {
  type: "function_call_arguments_tokens";
  content: {
    block_type: string;
    block_name: string;
    input_index: number;
    map: {
      name: string;
      iteration: number;
    } | null;
    tokens: {
      text: string;
    };
  };
};

export type DustAPICredentials = {
  apiKey: string;
  workspaceId: string;
};

type PublicPostContentFragmentRequestBody = t.TypeOf<
  typeof PublicPostContentFragmentRequestBodySchema
>;

/**
 * This help functions process a streamed response in the format of the Dust API for running
 * streamed apps.
 *
 * @param res an HTTP response ready to be consumed as a stream
 */
export async function processStreamedRunResponse(
  res: Response,
  logger: LoggerInterface
) {
  if (!res.ok || !res.body) {
    return new Err({
      type: "dust_api_error",
      message: `Error running streamed app: status_code=${res.status}`,
    });
  }

  let hasRunId = false;
  let rejectDustRunIdPromise: (err: Error) => void;
  let resolveDustRunIdPromise: (runId: string) => void;
  const dustRunIdPromise = new Promise<string>((resolve, reject) => {
    rejectDustRunIdPromise = reject;
    resolveDustRunIdPromise = resolve;
  });

  let pendingEvents: (
    | DustAppRunErroredEvent
    | DustAppRunRunStatusEvent
    | DustAppRunBlockStatusEvent
    | DustAppRunBlockExecutionEvent
    | DustAppRunTokensEvent
    | DustAppRunFunctionCallEvent
    | DustAppRunFunctionCallArgumentsTokensEvent
    | DustAppRunFinalEvent
  )[] = [];

  const parser = createParser((event) => {
    if (event.type === "event") {
      if (event.data) {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "error": {
              pendingEvents.push({
                type: "error",
                content: {
                  code: data.content.code,
                  message: data.content.message,
                },
              } as DustAppRunErroredEvent);
              break;
            }
            case "run_status": {
              pendingEvents.push({
                type: data.type,
                content: data.content,
              });
              break;
            }
            case "block_status": {
              pendingEvents.push({
                type: data.type,
                content: data.content,
              });
              break;
            }
            case "block_execution": {
              pendingEvents.push({
                type: data.type,
                content: data.content,
              });
              break;
            }
            case "tokens": {
              pendingEvents.push({
                type: "tokens",
                content: data.content,
              } as DustAppRunTokensEvent);
              break;
            }
            case "function_call": {
              pendingEvents.push({
                type: "function_call",
                content: data.content,
              } as DustAppRunFunctionCallEvent);
              break;
            }
            case "function_call_arguments_tokens": {
              pendingEvents.push({
                type: "function_call_arguments_tokens",
                content: data.content,
              } as DustAppRunFunctionCallArgumentsTokensEvent);
              break;
            }
            case "final": {
              pendingEvents.push({
                type: "final",
              } as DustAppRunFinalEvent);
            }
          }
          if (data.content?.run_id && !hasRunId) {
            hasRunId = true;
            resolveDustRunIdPromise(data.content.run_id);
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
      if (!hasRunId) {
        // once the stream is entirely consumed, if we haven't received a run id, reject the promise
        setImmediate(() => {
          logger.error({}, "No run id received.");
          rejectDustRunIdPromise(new Error("No run id received"));
        });
      }
    } catch (e) {
      yield {
        type: "error",
        content: {
          code: "stream_error",
          message: "Error streaming chunks",
        },
      } as DustAppRunErroredEvent;
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

  return new Ok({ eventStream: streamEvents(), dustRunId: dustRunIdPromise });
}

export class DustAPI {
  _credentials: DustAPICredentials;
  _useLocalInDev: boolean;
  _logger: LoggerInterface;
  _urlOverride?: string;

  /**
   * @param credentials DustAPICrededentials
   */
  constructor(
    credentials: DustAPICredentials,
    logger: LoggerInterface,
    {
      useLocalInDev,
      urlOverride,
    }: {
      useLocalInDev: boolean;
      urlOverride?: string;
    } = { useLocalInDev: false }
  ) {
    this._credentials = credentials;
    this._logger = logger;
    this._useLocalInDev = useLocalInDev;
    this._urlOverride = urlOverride;
  }

  workspaceId(): string {
    return this._credentials.workspaceId;
  }

  apiUrl() {
    if (this._urlOverride) {
      return this._urlOverride;
    }
    return this._useLocalInDev && NODE_ENV === "development"
      ? "http://localhost:3000"
      : DUST_PROD_API;
  }

  /**
   * This functions talks directly to the Dust production API to create a run.
   *
   * @param app DustAppType the app to run streamed
   * @param config DustAppConfigType the app config
   * @param inputs any[] the app inputs
   */
  async runApp(
    app: DustAppType,
    config: DustAppConfigType,
    inputs: unknown[],
    { useWorkspaceCredentials }: { useWorkspaceCredentials: boolean } = {
      useWorkspaceCredentials: false,
    }
  ) {
    let url = `${this.apiUrl()}/api/v1/w/${app.workspaceId}/apps/${
      app.appId
    }/runs`;
    if (useWorkspaceCredentials) {
      url += "?use_workspace_credentials=true";
    }
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._credentials.apiKey}`,
      },
      body: JSON.stringify({
        specification_hash: app.appHash,
        config: config,
        stream: false,
        blocking: true,
        inputs: inputs,
      }),
    });

    const json = await res.json();
    if (json.error) {
      return new Err(json.error as DustAPIErrorResponse);
    }
    return new Ok(json.run as RunType);
  }

  /**
   * This functions talks directly to the Dust production API to create a streamed run.
   *
   * @param app DustAppType the app to run streamed
   * @param config DustAppConfigType the app config
   * @param inputs any[] the app inputs
   */
  async runAppStreamed(
    app: DustAppType,
    config: DustAppConfigType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputs: any[],
    { useWorkspaceCredentials }: { useWorkspaceCredentials: boolean } = {
      useWorkspaceCredentials: false,
    }
  ) {
    let url = `${this.apiUrl()}/api/v1/w/${app.workspaceId}/apps/${
      app.appId
    }/runs`;
    if (useWorkspaceCredentials) {
      url += "?use_workspace_credentials=true";
    }
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._credentials.apiKey}`,
      },
      body: JSON.stringify({
        specification_hash: app.appHash,
        config: config,
        stream: true,
        blocking: false,
        inputs: inputs,
      }),
    });

    return processStreamedRunResponse(res, this._logger);
  }

  /**
   * This actions talks to the Dust production API to retrieve the list of data sources of the
   * specified workspace id.
   *
   * @param workspaceId string the workspace id to fetch data sources for
   */
  async getDataSources(workspaceId: string) {
    const res = await fetch(
      `${this.apiUrl()}/api/v1/w/${workspaceId}/data_sources`,
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

  async getAgentConfigurations() {
    const res = await fetch(
      `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/assistant/agent_configurations`,
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
    return new Ok(json.agentConfigurations as LightAgentConfigurationType[]);
  }

  async postContentFragment({
    conversationId,
    contentFragment,
  }: {
    conversationId: string;
    contentFragment: PublicPostContentFragmentRequestBody;
  }) {
    const res = await fetch(
      `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/assistant/conversations/${conversationId}/content_fragments`,
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

  // When creating a conversation with a user message, the API returns only after the user message
  // was created (and if applicable the assocaited agent messages).
  async createConversation({
    title,
    visibility,
    message,
    contentFragment,
  }: t.TypeOf<typeof PublicPostConversationsRequestBodySchema>): Promise<
    Result<
      { conversation: ConversationType; message: UserMessageType },
      DustAPIErrorResponse
    >
  > {
    const res = await fetch(
      `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/assistant/conversations`,
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
    message: t.TypeOf<typeof PublicPostMessagesRequestBodySchema>;
  }) {
    const res = await fetch(
      `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/assistant/conversations/${conversationId}/messages`,
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
      `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/assistant/conversations/${
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
            this._logger.error(
              { error: err },
              "Failed parsing chunk from Dust API"
            );
          }
        }
      }
    });

    const reader = res.body.getReader();
    const logger = this._logger;

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
        } as DustAppRunErroredEvent;
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
      `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/assistant/conversations/${conversationId}`,
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
