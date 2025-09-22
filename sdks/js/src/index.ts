import { createParser } from "eventsource-parser";
import { z } from "zod";

import {
  AgentActionSpecificEvent,
  AgentActionSuccessEvent,
  AgentConfigurationViewType,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentMessageDoneEvent,
  AgentMessagePublicType,
  AgentMessageSuccessEvent,
  APIError,
  APIErrorSchema,
  AppsCheckRequestType,
  AppsCheckResponseSchema,
  BlockedActionsResponseSchema,
  BlockedActionsResponseType,
  CancelMessageGenerationRequestType,
  CancelMessageGenerationResponseSchema,
  ConversationPublicType,
  CreateConversationResponseSchema,
  CreateConversationResponseType,
  CreateGenericAgentConfigurationResponseSchema,
  DataSourceViewResponseSchema,
  DataSourceViewType,
  DeleteFolderResponseSchema,
  DustAPICredentials,
  DustAppConfigType,
  DustAppRunBlockExecutionEvent,
  DustAppRunBlockStatusEvent,
  DustAppRunErroredEvent,
  DustAppRunFinalEvent,
  DustAppRunFunctionCallArgumentsTokensEvent,
  DustAppRunFunctionCallEvent,
  DustAppRunReasoningItemEvent,
  DustAppRunReasoningTokensEvent,
  DustAppRunRunStatusEvent,
  DustAppRunTokensEvent,
  Err,
  FileUploadRequestResponseSchema,
  FileUploadUrlRequestType,
  GenerationTokensEvent,
  GetActiveMemberEmailsInWorkspaceResponseSchema,
  GetAgentConfigurationsResponseSchema,
  GetAppsResponseSchema,
  GetConversationResponseSchema,
  GetConversationsResponseSchema,
  GetDataSourcesResponseSchema,
  GetFeedbacksResponseSchema,
  GetMCPServerViewsResponseSchema,
  GetSpacesResponseSchema,
  GetWorkspaceFeatureFlagsResponseSchema,
  GetWorkspaceVerifiedDomainsResponseSchema,
  HeartbeatMCPResponseSchema,
  HeartbeatMCPResponseType,
  LoggerInterface,
  MeResponseSchema,
  Ok,
  PatchConversationRequestType,
  PatchConversationResponseSchema,
  PatchDataSourceViewRequestType,
  PostContentFragmentResponseSchema,
  PostMCPResultsResponseSchema,
  PostMCPResultsResponseType,
  PostMessageFeedbackResponseSchema,
  PostUserMessageResponseSchema,
  PostWorkspaceSearchResponseBodySchema,
  PublicHeartbeatMCPRequestBody,
  PublicPostContentFragmentRequestBody,
  PublicPostConversationsRequestBody,
  PublicPostMCPResultsRequestBody,
  PublicPostMessageFeedbackRequestBody,
  PublicPostMessagesRequestBody,
  PublicRegisterMCPRequestBody,
  RegisterMCPResponseSchema,
  RegisterMCPResponseType,
  Result,
  RetryMessageResponseSchema,
  RunAppResponseSchema,
  SearchDataSourceViewsResponseSchema,
  SearchRequestBodyType,
  TokenizeResponseSchema,
  ToolErrorEvent,
  UpsertFolderResponseSchema,
  UserMessageErrorEvent,
  ValidateActionRequestBodyType,
  ValidateActionResponseSchema,
  ValidateActionResponseType,
} from "./types";

export * from "./internal_mime_types";
export * from "./mcp_transport";
export * from "./output_schemas";
export * from "./types";

interface DustResponse {
  status: number;
  ok: boolean;
  url: string;
  body: ReadableStream<Uint8Array> | string;
}

// Detects whether an error corresponds to a terminated/aborted stream.
function isStreamTerminationError(e: unknown): boolean {
  if (!e) {
    return false;
  }
  const msg = typeof e === "string" ? e : (e as Error)?.message ?? String(e);
  const name = (e as Error)?.name ?? "";

  // Common patterns from undici/fetch when a stream is cut or aborted.
  const patterns = [
    /terminated/i,
    /aborted/i,
    /The operation was aborted/i,
    /network.*(error|changed|lost)/i,
    /socket hang up/i,
  ];

  if (name === "AbortError") {
    return true;
  }
  if (name === "TypeError" && /terminated|aborted/i.test(msg)) {
    return true;
  }
  return patterns.some((p) => p.test(msg));
}

function isTransientHttpStatus(status: number): boolean {
  // Only retry on explicit transient statuses; do NOT retry on 5xx.
  return status === 408 || status === 429;
}

// Copied from front/hooks/useEventSource.ts
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;
const DEFAULT_RECONNECT_DELAY = 5000;

type AgentEvent =
  | AgentActionSpecificEvent
  | AgentActionSuccessEvent
  | AgentErrorEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent
  | AgentMessageDoneEvent
  | GenerationTokensEvent
  | UserMessageErrorEvent
  | ToolErrorEvent;

const textFromResponse = async (response: DustResponse): Promise<string> => {
  if (typeof response.body === "string") {
    return response.body;
  }

  // Convert ReadableStream to string
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";

  try {
    let done = false;
    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      if (value) {
        result += decoder.decode(value, { stream: true });
      }
    }

    result += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  return result;
};

type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type RequestArgsType = {
  method: RequestMethod;
  path: string;
  query?: URLSearchParams;
  body?: Record<string, unknown>;
  overrideWorkspaceId?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  stream?: boolean;
};

export class DustAPI {
  _url: string;
  _credentials: DustAPICredentials;
  _logger: LoggerInterface;
  _urlOverride: string | undefined | null;

  /**
   * @param credentials DustAPICrededentials
   */
  constructor(
    config: {
      url: string;
    },
    credentials: DustAPICredentials,
    logger: LoggerInterface,
    urlOverride?: string | undefined | null
  ) {
    this._url = config.url;
    this._credentials = credentials;
    this._logger = logger;
    this._urlOverride = urlOverride;
  }

  workspaceId(): string {
    return this._credentials.workspaceId;
  }

  setWorkspaceId(workspaceId: string) {
    this._credentials.workspaceId = workspaceId;
  }

  apiUrl(): string {
    return this._urlOverride ? this._urlOverride : this._url;
  }

  async getApiKey(): Promise<string | null> {
    if (typeof this._credentials.apiKey === "function") {
      return this._credentials.apiKey();
    }
    return this._credentials.apiKey;
  }

  async baseHeaders() {
    const headers: RequestInit["headers"] = {
      Authorization: `Bearer ${await this.getApiKey()}`,
    };
    if (this._credentials.extraHeaders) {
      Object.assign(headers, this._credentials.extraHeaders);
    }
    return headers;
  }

  /**
   * Fetches the current user's information from the API.
   *
   * This method sends a GET request to the `/api/v1/me` endpoint with the necessary authorization
   * headers. It then processes the response to extract the user information.  Note that this will
   * only work if you are using an OAuth2 token. It will always fail with a workspace API key.
   *
   * @returns {Promise<Result<User, Error>>} A promise that resolves to a Result object containing
   * either the user information or an error.
   */
  async me() {
    // This method call directly _fetchWithError and _resultFromResponse as it's a little special:
    // it doesn't live under the workspace resource.
    const headers: RequestInit["headers"] = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await this.getApiKey()}`,
    };

    const res = await this._fetchWithError(`${this.apiUrl()}/api/v1/me`, {
      method: "GET",
      headers,
    });

    const r = await this._resultFromResponse(MeResponseSchema, res);

    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.user);
  }

  async request(args: RequestArgsType) {
    // Conveniently clean path from any leading "/" just in case
    args.path = args.path.replace(/^\/+/, "");

    let url = `${this.apiUrl()}/api/v1/w/${
      args.overrideWorkspaceId ?? this.workspaceId()
    }/${args.path}`;

    if (args.query) {
      url += `?${args.query.toString()}`;
    }

    const headers = { ...(await this.baseHeaders()), ...args.headers };
    headers["Content-Type"] = "application/json";

    if (args.stream) {
      headers["Accept"] = "text/event-stream";
    }

    const res = await this._fetchWithError(url, {
      method: args.method,
      headers,
      body: args.body ? JSON.stringify(args.body) : undefined,
      signal: args.signal,
      stream: args.stream,
    });

    return res;
  }

  /**
   * This functions talks directly to the Dust production API to create a run.
   *
   * @param app DustAppType the app to run streamed
   * @param config DustAppConfigType the app config
   * @param inputs any[] the app inputs
   */
  async runApp(
    {
      workspaceId,
      appId,
      appHash,
      appSpaceId,
    }: {
      workspaceId: string;
      appId: string;
      appSpaceId: string;
      appHash: string;
    },
    config: DustAppConfigType,
    inputs: unknown[],
    { useWorkspaceCredentials }: { useWorkspaceCredentials: boolean } = {
      useWorkspaceCredentials: false,
    }
  ) {
    const res = await this.request({
      overrideWorkspaceId: workspaceId,
      path: `spaces/${appSpaceId}/apps/${appId}/runs`,
      query: new URLSearchParams({
        use_workspace_credentials: useWorkspaceCredentials ? "true" : "false",
      }),
      method: "POST",
      body: {
        specification_hash: appHash,
        config,
        stream: false,
        blocking: true,
        inputs,
      },
    });

    const r = await this._resultFromResponse(RunAppResponseSchema, res);

    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.run);
  }

  /**
   * This functions talks directly to the Dust production API to create a streamed run.
   *
   * @param app DustAppType the app to run streamed
   * @param config DustAppConfigType the app config
   * @param inputs any[] the app inputs
   */
  async runAppStreamed(
    {
      workspaceId,
      appId,
      appHash,
      appSpaceId,
    }: {
      workspaceId: string;
      appId: string;
      appSpaceId: string;
      appHash: string;
    },
    config: DustAppConfigType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputs: any[],
    { useWorkspaceCredentials }: { useWorkspaceCredentials: boolean } = {
      useWorkspaceCredentials: false,
    }
  ) {
    const res = await this.request({
      overrideWorkspaceId: workspaceId,
      path: `spaces/${appSpaceId}/apps/${appId}/runs`,
      query: new URLSearchParams({
        use_workspace_credentials: useWorkspaceCredentials ? "true" : "false",
      }),
      method: "POST",
      body: {
        specification_hash: appHash,
        config,
        stream: true,
        blocking: false,
        inputs,
      },
      stream: true,
    });

    if (res.isErr()) {
      return res;
    }

    /**
     * This help functions process a streamed response in the format of the Dust API for running
     * streamed apps.
     *
     * @param res an HTTP response ready to be consumed as a stream
     */
    async function processStreamedRunResponse(
      res: DustResponse,
      logger: LoggerInterface
    ) {
      if (!res.ok || !res.body) {
        const text = await textFromResponse(res);
        return new Err({
          type: "dust_api_error",
          message: `Error running streamed app: status_code=${res.status} body=${text}`,
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
        | DustAppRunReasoningTokensEvent
        | DustAppRunReasoningItemEvent
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

                case "reasoning_tokens": {
                  pendingEvents.push({
                    type: "reasoning_tokens",
                    content: data.content,
                  } as DustAppRunReasoningTokensEvent);
                  break;
                }

                case "reasoning_item": {
                  pendingEvents.push({
                    type: "reasoning_item",
                    content: data.content,
                  } as DustAppRunReasoningItemEvent);
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
                  break;
                }
              }
              if (data.content?.run_id && !hasRunId) {
                hasRunId = true;
                resolveDustRunIdPromise(data.content.run_id);
              }
            } catch (err) {
              logger.error(
                { error: err },
                "Failed parsing chunk from Dust API"
              );
            }
          }
        }
      });

      const streamEvents = async function* () {
        if (!res.body || typeof res.body === "string") {
          throw new Error(
            "Expected a stream response, but got a string or null"
          );
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        try {
          for (;;) {
            const { value, done } = await reader.read();

            if (value) {
              parser.feed(decoder.decode(value, { stream: true }));

              for (const event of pendingEvents) {
                yield event;
              }

              pendingEvents = [];
            }

            if (done) {
              break;
            }
          }

          if (!hasRunId) {
            // Once the stream is entirely consumed, if we haven't received a run id, reject the
            // promise.
            setImmediate(() => {
              logger.error({}, "No run id received.");
              rejectDustRunIdPromise(new Error("No run id received"));
            });
          }
        } catch (e) {
          logger.error(
            {
              error: e,
              errorStr: JSON.stringify(e),
              errorSource: "processStreamedRunResponse",
            },
            "DustAPI error: streaming chunks"
          );
          yield {
            type: "error",
            content: {
              code: "stream_error",
              message: "Error streaming chunks",
            },
          } as DustAppRunErroredEvent;
        }
      };

      return new Ok({
        eventStream: streamEvents(),
        dustRunId: dustRunIdPromise,
      });
    }

    return processStreamedRunResponse(res.value.response, this._logger);
  }

  /**
   * This actions talks to the Dust production API to retrieve the list of data sources of the
   * current workspace.
   */
  async getDataSources() {
    const res = await this.request({
      method: "GET",
      path: "data_sources",
    });

    const r = await this._resultFromResponse(GetDataSourcesResponseSchema, res);
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.data_sources);
  }

  async getAgentConfigurations({
    view,
    includes = [],
  }: {
    view?: AgentConfigurationViewType;
    includes?: "authors"[];
  }) {
    // Function to generate query parameters.
    function getQueryString() {
      const params = new URLSearchParams();
      if (typeof view === "string") {
        params.append("view", view);
      }
      if (includes.includes("authors")) {
        params.append("withAuthors", "true");
      }

      return params.toString();
    }

    const queryString = view || includes.length > 0 ? getQueryString() : null;
    const path = queryString
      ? `assistant/agent_configurations?${queryString}`
      : "assistant/agent_configurations";

    const res = await this.request({
      path,
      method: "GET",
    });

    const r = await this._resultFromResponse(
      GetAgentConfigurationsResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.agentConfigurations);
  }

  async postContentFragment({
    conversationId,
    contentFragment,
  }: {
    conversationId: string;
    contentFragment: PublicPostContentFragmentRequestBody;
  }) {
    const res = await this.request({
      method: "POST",
      path: `assistant/conversations/${conversationId}/content_fragments`,
      body: { ...contentFragment },
    });

    const r = await this._resultFromResponse(
      PostContentFragmentResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.contentFragment);
  }

  async createGenericAgentConfiguration({
    name,
    description,
    instructions,
    emoji,
    subAgentName,
    subAgentDescription,
    subAgentInstructions,
    subAgentEmoji,
  }: {
    name: string;
    description: string;
    instructions: string;
    emoji?: string;
    subAgentName?: string;
    subAgentDescription?: string;
    subAgentInstructions?: string;
    subAgentEmoji?: string;
  }) {
    const res = await this.request({
      method: "POST",
      path: "assistant/generic_agents",
      body: {
        name,
        description,
        instructions,
        emoji,
        subAgentName,
        subAgentDescription,
        subAgentInstructions,
        subAgentEmoji,
      },
    });

    const r = await this._resultFromResponse(
      CreateGenericAgentConfigurationResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value);
  }

  // When creating a conversation with a user message, the API returns only after the user message
  // was created (and if applicable the associated agent messages).
  async createConversation({
    title,
    visibility,
    depth,
    message,
    contentFragment,
    contentFragments,
    blocking = false,
    skipToolsValidation = false,
    params,
  }: PublicPostConversationsRequestBody & {
    params?: Record<string, string>;
  }): Promise<Result<CreateConversationResponseType, APIError>> {
    const queryParams = new URLSearchParams(params);

    const res = await this.request({
      method: "POST",
      path: "assistant/conversations",
      query: queryParams.toString() ? queryParams : undefined,
      body: {
        title,
        visibility,
        depth,
        message,
        contentFragment,
        contentFragments,
        blocking,
        skipToolsValidation,
      },
    });

    return this._resultFromResponse(CreateConversationResponseSchema, res);
  }

  async postUserMessage({
    conversationId,
    message,
  }: {
    conversationId: string;
    message: PublicPostMessagesRequestBody;
  }) {
    const res = await this.request({
      method: "POST",
      path: `assistant/conversations/${conversationId}/messages`,
      body: { ...message },
    });

    const r = await this._resultFromResponse(
      PostUserMessageResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.message);
  }

  async streamAgentAnswerEvents({
    conversation,
    userMessageId,
    signal,
    options = {
      maxReconnectAttempts: DEFAULT_MAX_RECONNECT_ATTEMPTS,
      reconnectDelay: DEFAULT_RECONNECT_DELAY,
      autoReconnect: true,
    },
  }: {
    conversation: ConversationPublicType;
    userMessageId: string;
    signal?: AbortSignal;
    options?: {
      maxReconnectAttempts?: number;
      reconnectDelay?: number;
      autoReconnect?: boolean;
    };
  }): Promise<
    Result<
      {
        eventStream: AsyncGenerator<AgentEvent, void, unknown>;
      },
      { type: string; message: string } | Error
    >
  > {
    const agentMessages = conversation.content
      .map((versions) => {
        const m = versions[versions.length - 1];
        return m;
      })
      .filter((m): m is AgentMessagePublicType => {
        return (
          m && m.type === "agent_message" && m.parentMessageId === userMessageId
        );
      });

    if (agentMessages.length === 0) {
      return new Err(new Error("Failed to retrieve agent message"));
    }

    const agentMessage = agentMessages[0];
    return this.streamAgentMessageEvents({
      conversation,
      agentMessage,
      signal,
      options: {
        maxReconnectAttempts:
          options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS,
        reconnectDelay: options.reconnectDelay ?? DEFAULT_RECONNECT_DELAY,
        autoReconnect: options.autoReconnect ?? true,
      },
    });
  }

  async streamAgentMessageEvents({
    conversation,
    agentMessage,
    signal,
    options,
  }: {
    conversation: ConversationPublicType;
    agentMessage: AgentMessagePublicType;
    signal?: AbortSignal;
    options: {
      maxReconnectAttempts: number;
      reconnectDelay: number;
      autoReconnect: boolean;
    };
  }): Promise<
    Result<
      {
        eventStream: AsyncGenerator<AgentEvent, void, unknown>;
      },
      { type: string; message: string }
    >
  > {
    const { maxReconnectAttempts, reconnectDelay, autoReconnect } = options;

    let lastEventId: string | null = null;

    const terminalEventTypes: AgentEvent["type"][] = [
      "agent_message_success",
      "agent_error",
      "agent_generation_cancelled",
      "user_message_error",
    ];

    const createRequest = async (lastId?: string | null) => {
      let path = `assistant/conversations/${conversation.sId}/messages/${agentMessage.sId}/events`;
      if (lastId) {
        path += `?lastEventId=${lastId}`;
      }

      return this.request({
        method: "GET",
        path,
        signal,
        stream: true,
      });
    };

    const logger = this._logger;
    let reconnectAttempts = 0;
    let receivedTerminalEvent = false;

    const streamEventsWithReconnection = async function* () {
      while (true) {
        if (signal?.aborted) {
          return;
        }

        const res = await createRequest(lastEventId);

        if (res.isErr()) {
          // Treat request errors as transient and apply reconnection policy when enabled.
          if (autoReconnect) {
            reconnectAttempts += 1;
            if (reconnectAttempts >= maxReconnectAttempts) {
              throw new Error(
                `Exceeded maximum reconnection attempts (request error): ${res.error.message}`
              );
            }
            await new Promise((resolve) => setTimeout(resolve, reconnectDelay));
            continue;
          } else {
            const error = res.error;
            throw new Error(`Error requesting event stream: ${error.message}`);
          }
        }

        if (!res.value.response.ok || !res.value.response.body) {
          if (
            autoReconnect &&
            isTransientHttpStatus(res.value.response.status)
          ) {
            reconnectAttempts += 1;
            if (reconnectAttempts >= maxReconnectAttempts) {
              throw new Error(
                `Exceeded maximum reconnection attempts (http ${res.value.response.status})`
              );
            }
            await new Promise((resolve) => setTimeout(resolve, reconnectDelay));
            continue;
          }
          throw new Error(
            `Error requesting event stream: status_code=${res.value.response.status}`
          );
        }

        let pendingEvents: AgentEvent[] = [];

        const parser = createParser((event) => {
          if (event.type === "event") {
            if (event.data) {
              try {
                const eventData = JSON.parse(event.data);
                if (eventData.eventId) {
                  lastEventId = eventData.eventId;
                }
                pendingEvents.push(eventData.data);
              } catch (err) {
                logger.error(
                  { error: err },
                  "Failed parsing chunk from Dust API"
                );
              }
            }
          }
        });

        if (
          !res.value.response.body ||
          typeof res.value.response.body === "string"
        ) {
          throw new Error(
            "Expected a stream response, but got a string or null"
          );
        }

        const reader = res.value.response.body.getReader();
        const decoder = new TextDecoder();

        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (value) {
              parser.feed(decoder.decode(value, { stream: true }));

              for (const event of pendingEvents) {
                yield event;

                if (terminalEventTypes.includes(event.type)) {
                  receivedTerminalEvent = true;
                }
              }
              pendingEvents = [];
            }

            if (done) {
              break;
            }
          }
        } catch (e) {
          logger.error({ error: e }, "Failed processing event stream");
          // Respect caller-initiated aborts.
          if (signal?.aborted) {
            return;
          }
          // Apply reconnection policy on stream termination/abort; otherwise propagate.
          if (!isStreamTerminationError(e)) {
            throw new Error(`Error processing event stream: ${e}`);
          }
          // Do not throw; flow continues to reconnection block below.
        } finally {
          reader.releaseLock();
        }

        // Stream ended - check if we need to reconnect
        if (!receivedTerminalEvent && autoReconnect) {
          reconnectAttempts += 1;

          if (reconnectAttempts >= maxReconnectAttempts) {
            throw new Error("Exceeded maximum reconnection attempts");
          }

          await new Promise((resolve) => setTimeout(resolve, reconnectDelay));
          continue;
        }

        // terminal event or autoReconnect disabled, exit the generator
        return;
      }
    };

    return new Ok({ eventStream: streamEventsWithReconnection() });
  }

  async cancelMessageGeneration({
    conversationId,
    messageIds,
  }: {
    conversationId: string;
    messageIds: string[];
  }) {
    const res = await this.request({
      method: "POST",
      path: `assistant/conversations/${conversationId}/cancel`,
      body: {
        messageIds,
      } as CancelMessageGenerationRequestType,
    });

    const r = await this._resultFromResponse(
      CancelMessageGenerationResponseSchema,
      res
    );

    if (r.isErr()) {
      return r;
    } else {
      return new Ok(r.value);
    }
  }

  async markAsRead({ conversationId }: { conversationId: string }) {
    const res = await this.request({
      method: "PATCH",
      path: `assistant/conversations/${conversationId}`,
      body: {
        read: true,
      } as PatchConversationRequestType,
    });

    const r = await this._resultFromResponse(
      PatchConversationResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.success);
  }

  async getConversations() {
    const res = await this.request({
      method: "GET",
      path: `assistant/conversations`,
    });

    const r = await this._resultFromResponse(
      GetConversationsResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.conversations);
  }

  async getConversation({ conversationId }: { conversationId: string }) {
    const res = await this.request({
      method: "GET",
      path: `assistant/conversations/${conversationId}`,
    });

    const r = await this._resultFromResponse(
      GetConversationResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.conversation);
  }

  async getConversationFeedback({
    conversationId,
  }: {
    conversationId: string;
  }) {
    const res = await this.request({
      method: "GET",
      path: `assistant/conversations/${conversationId}/feedbacks`,
    });

    const r = await this._resultFromResponse(GetFeedbacksResponseSchema, res);
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.feedbacks);
  }

  async postFeedback(
    conversationId: string,
    messageId: string,
    feedback: PublicPostMessageFeedbackRequestBody
  ) {
    const res = await this.request({
      method: "POST",
      path: `assistant/conversations/${conversationId}/messages/${messageId}/feedbacks`,
      body: feedback,
    });

    return this._resultFromResponse(PostMessageFeedbackResponseSchema, res);
  }

  async deleteFeedback(conversationId: string, messageId: string) {
    const res = await this.request({
      method: "DELETE",
      path: `assistant/conversations/${conversationId}/messages/${messageId}/feedbacks`,
    });

    return this._resultFromResponse(PostMessageFeedbackResponseSchema, res);
  }

  async tokenize(
    text: string,
    dataSourceId: string,
    opts?: { signal?: AbortSignal }
  ) {
    const res = await this.request({
      method: "POST",
      path: `data_sources/${dataSourceId}/tokenize`,
      body: { text },
      signal: opts?.signal,
    });

    const r = await this._resultFromResponse(TokenizeResponseSchema, res);
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.tokens);
  }

  async upsertFolder({
    dataSourceId,
    folderId,
    timestamp,
    title,
    parentId,
    parents,
    mimeType,
    sourceUrl,
    providerVisibility,
  }: {
    dataSourceId: string;
    folderId: string;
    timestamp: number;
    title: string;
    parentId: string | null;
    parents: string[];
    mimeType: string;
    sourceUrl: string | null;
    providerVisibility: "public" | "private" | null;
  }) {
    const res = await this.request({
      method: "POST",
      path: `data_sources/${dataSourceId}/folders/${encodeURIComponent(
        folderId
      )}`,
      body: {
        timestamp: Math.floor(timestamp),
        title,
        parent_id: parentId,
        parents,
        mime_type: mimeType,
        source_url: sourceUrl,
        provider_visibility: providerVisibility,
      },
    });

    const r = await this._resultFromResponse(UpsertFolderResponseSchema, res);
    if (r.isErr()) {
      return r;
    }

    return new Ok(r.value);
  }

  async deleteFolder({
    dataSourceId,
    folderId,
  }: {
    dataSourceId: string;
    folderId: string;
  }) {
    const res = await this.request({
      method: "DELETE",
      path: `data_sources/${dataSourceId}/folders/${encodeURIComponent(
        folderId
      )}`,
    });

    const r = await this._resultFromResponse(DeleteFolderResponseSchema, res);
    if (r.isErr()) {
      return r;
    }

    return new Ok(r.value);
  }

  async uploadFile({
    contentType,
    fileName,
    fileSize,
    useCase,
    useCaseMetadata,
    fileObject,
  }: FileUploadUrlRequestType & { fileObject: File }) {
    const res = await this.request({
      method: "POST",
      path: "files",
      body: {
        contentType,
        fileName,
        fileSize,
        useCase,
        useCaseMetadata,
      },
    });

    const fileRes = await this._resultFromResponse(
      FileUploadRequestResponseSchema,
      res
    );

    if (fileRes.isErr()) {
      return fileRes;
    }

    const { file } = fileRes.value;

    const formData = new FormData();
    formData.append("file", fileObject);

    // Upload file to the obtained URL.
    try {
      const headers = await this.baseHeaders();

      const response = await fetch(file.uploadUrl, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return new Err(
          new Error(
            errorData?.error?.message ||
              `Failed to upload file: ${response.status}`
          )
        );
      }

      const responseData = await response.json();
      return new Ok(responseData.file);
    } catch (err) {
      return new Err(
        new Error(err instanceof Error ? err.message : "Unknown error")
      );
    }
  }

  async deleteFile({ fileID }: { fileID: string }) {
    const res = await this.request({
      method: "DELETE",
      path: `files/${fileID}`,
    });

    return res;
  }

  async getActiveMemberEmailsInWorkspace() {
    const res = await this.request({
      method: "GET",
      path: "members/emails",
      query: new URLSearchParams({ activeOnly: "true" }),
    });

    const r = await this._resultFromResponse(
      GetActiveMemberEmailsInWorkspaceResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }

    return new Ok(r.value.emails);
  }

  async getWorkspaceVerifiedDomains() {
    const res = await this.request({
      method: "GET",
      path: "verified_domains",
    });

    const r = await this._resultFromResponse(
      GetWorkspaceVerifiedDomainsResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }

    return new Ok(r.value.verified_domains);
  }

  async getWorkspaceFeatureFlags() {
    const res = await this.request({
      method: "GET",
      path: "feature_flags",
    });

    const r = await this._resultFromResponse(
      GetWorkspaceFeatureFlagsResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }

    return new Ok(r.value.feature_flags);
  }

  async searchDataSourceViews(searchParams: URLSearchParams) {
    const res = await this.request({
      method: "GET",
      path: "data_source_views/search",
      query: searchParams,
    });

    const r = await this._resultFromResponse(
      SearchDataSourceViewsResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }

    return new Ok(r.value.data_source_views);
  }

  async patchDataSourceView(
    dataSourceView: DataSourceViewType,
    patch: PatchDataSourceViewRequestType
  ) {
    const res = await this.request({
      method: "PATCH",
      path: `spaces/${dataSourceView.spaceId}/data_source_views/${dataSourceView.sId}`,
      body: patch,
    });

    const r = await this._resultFromResponse(DataSourceViewResponseSchema, res);
    if (r.isErr()) {
      return r;
    }

    return new Ok(r.value.dataSourceView);
  }

  async exportApps({ appSpaceId }: { appSpaceId: string }) {
    const res = await this.request({
      method: "GET",
      path: `spaces/${appSpaceId}/apps/export`,
    });

    const r = await this._resultFromResponse(GetAppsResponseSchema, res);

    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.apps);
  }

  async checkApps(apps: AppsCheckRequestType, appSpaceId: string) {
    const res = await this.request({
      method: "POST",
      path: `spaces/${appSpaceId}/apps/check`,
      body: apps,
    });

    const r = await this._resultFromResponse(AppsCheckResponseSchema, res);

    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.apps);
  }

  async getSpaces() {
    const res = await this.request({
      method: "GET",
      path: "spaces",
    });

    const r = await this._resultFromResponse(GetSpacesResponseSchema, res);

    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.spaces);
  }

  async getMCPServerViews(spaceId: string, includeAuto = false) {
    const res = await this.request({
      method: "GET",
      path: `spaces/${spaceId}/mcp_server_views`,
      query: new URLSearchParams({ includeAuto: includeAuto.toString() }),
    });

    const r = await this._resultFromResponse(
      GetMCPServerViewsResponseSchema,
      res
    );

    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.serverViews);
  }

  async searchNodes(searchParams: SearchRequestBodyType) {
    const res = await this.request({
      method: "POST",
      path: "search",
      body: searchParams,
    });

    const r = await this._resultFromResponse(
      PostWorkspaceSearchResponseBodySchema,
      res
    );
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.nodes);
  }

  async retryMessage({
    conversationId,
    messageId,
    blockedOnly = false,
  }: {
    conversationId: string;
    messageId: string;
    blockedOnly?: boolean;
  }) {
    const query = blockedOnly
      ? new URLSearchParams({ blocked_only: "true" })
      : undefined;

    const res = await this.request({
      method: "POST",
      path: `assistant/conversations/${conversationId}/messages/${messageId}/retry`,
      query,
    });

    const r = await this._resultFromResponse(RetryMessageResponseSchema, res);
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.message);
  }

  // MCP Related.

  async getBlockedActions({
    conversationId,
  }: {
    conversationId: string;
  }): Promise<Result<BlockedActionsResponseType, APIError>> {
    const res = await this.request({
      method: "GET",
      path: `assistant/conversations/${conversationId}/actions/blocked`,
    });

    return this._resultFromResponse(BlockedActionsResponseSchema, res);
  }

  async validateAction({
    conversationId,
    messageId,
    actionId,
    approved,
  }: ValidateActionRequestBodyType & {
    conversationId: string;
    messageId: string;
  }): Promise<Result<ValidateActionResponseType, APIError>> {
    const res = await this.request({
      method: "POST",
      path: `assistant/conversations/${conversationId}/messages/${messageId}/validate-action`,
      body: {
        actionId,
        approved,
      },
    });

    return this._resultFromResponse(ValidateActionResponseSchema, res);
  }

  async registerMCPServer({
    serverName,
  }: {
    serverName: string;
  }): Promise<Result<RegisterMCPResponseType, APIError>> {
    const body: PublicRegisterMCPRequestBody = {
      serverName,
    };

    const res = await this.request({
      method: "POST",
      path: "mcp/register",
      body,
    });

    return this._resultFromResponse(RegisterMCPResponseSchema, res);
  }

  async heartbeatMCPServer({
    serverId,
  }: {
    serverId: string;
  }): Promise<Result<HeartbeatMCPResponseType, APIError>> {
    const body: PublicHeartbeatMCPRequestBody = {
      serverId,
    };

    const res = await this.request({
      method: "POST",
      path: "mcp/heartbeat",
      body,
    });

    return this._resultFromResponse(HeartbeatMCPResponseSchema, res);
  }

  async postMCPResults({
    result,
    serverId,
  }: PublicPostMCPResultsRequestBody & { serverId: string }): Promise<
    Result<PostMCPResultsResponseType, APIError>
  > {
    const body: PublicPostMCPResultsRequestBody = {
      result,
      serverId,
    };

    const res = await this.request({
      method: "POST",
      path: "mcp/results",
      body,
    });

    return this._resultFromResponse(PostMCPResultsResponseSchema, res);
  }

  async getMCPRequestsConnectionDetails({
    serverId,
    lastEventId,
  }: {
    serverId: string;
    lastEventId?: string | null;
  }): Promise<
    Result<{ url: string; headers: Record<string, string> }, APIError>
  > {
    const url = `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/mcp/requests`;
    const params = new URLSearchParams({
      serverId,
      ...(lastEventId ? { lastEventId } : {}),
    });

    const headers = await this.baseHeaders();

    return new Ok({
      url: `${url}?${params.toString()}`,
      headers,
    });
  }

  private async _fetchWithError(
    url: string,
    {
      method = "GET",
      headers = {},
      body,
      signal,
      stream = false,
    }: {
      method?: RequestMethod;
      headers?: HeadersInit;
      body?: string;
      signal?: AbortSignal;
      stream?: boolean;
    } = {}
  ): Promise<Result<{ response: DustResponse; duration: number }, APIError>> {
    const now = Date.now();
    try {
      const res = await fetch(url, {
        method,
        headers,
        body,
        signal,
      });

      const responseBody = stream && res.body ? res.body : await res.text();

      const response: DustResponse = {
        status: res.status,
        url: res.url,
        body: responseBody,
        ok: res.ok,
      };

      return new Ok({ response, duration: Date.now() - now });
    } catch (e) {
      const duration = Date.now() - now;
      const err: APIError = {
        type: "unexpected_network_error",
        message: `Unexpected network error from DustAPI: ${e}`,
      };
      this._logger.error(
        {
          dustError: err,
          url,
          duration,
          connectorsError: err,
          error: e,
        },
        "DustAPI error"
      );
      return new Err(err);
    }
  }

  private async _resultFromResponse<T extends z.ZodTypeAny>(
    schema: T,
    res: Result<
      {
        response: DustResponse;
        duration: number;
      },
      APIError
    >
  ): Promise<Result<z.infer<T>, APIError>> {
    if (res.isErr()) {
      return res;
    }

    if (res.value.response.status === 413) {
      const err: APIError = {
        type: "content_too_large",
        message:
          "Your request content is too large, please try again with a shorter content.",
      };
      this._logger.error(
        {
          dustError: err,
          status: res.value.response.status,
          url: res.value.response.url,
          duration: res.value.duration,
        },
        "DustAPI error"
      );
      return new Err(err);
    }

    // We get the text and attempt to parse so that we can log the raw text in case of error (the
    // body is already consumed by response.json() if used otherwise).
    const text = await textFromResponse(res.value.response);

    try {
      const response = JSON.parse(text);
      const r = schema.safeParse(response);
      // This assume that safe parsing means a 200 status.
      if (r.success) {
        return new Ok(r.data as z.infer<T>);
      } else {
        // We couldn't parse the response directly, maybe it's an error
        const rErr = APIErrorSchema.safeParse(response["error"]);
        if (rErr.success) {
          // Successfully parsed an error
          this._logger.error(
            {
              dustError: rErr.data,
              status: res.value.response.status,
              url: res.value.response.url,
              duration: res.value.duration,
            },
            "DustAPI error"
          );
          return new Err(rErr.data);
        } else {
          // Unexpected response format (neither an error nor a valid response)
          const err: APIError = {
            type: "unexpected_response_format",
            message:
              `Unexpected response format from DustAPI calling ` +
              `${res.value.response.url} : ${r.error.message}`,
          };
          this._logger.error(
            {
              dustError: err,
              parseError: r.error.message,
              rawText: text,
              status: res.value.response.status,
              url: res.value.response.url,
              duration: res.value.duration,
            },
            "DustAPI error"
          );
          return new Err(err);
        }
      }
    } catch (e) {
      const err: APIError = {
        type: "unexpected_response_format",
        message:
          `Fail to parse response from DustAPI calling ` +
          `${res.value.response.url} : ${e}`,
      };
      this._logger.error(
        {
          dustError: err,
          error: e,
          rawText: text,
          status: res.value.response.status,
          url: res.value.response.url,
          duration: res.value.duration,
        },
        "DustAPI error"
      );
      return new Err(err);
    }
  }
}
