import { z } from "zod";
import type {
  AgentActionSpecificEvent,
  DustAppRunErroredEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentMessageSuccessEvent,
  AgentMessageType,
  APIError,
  ConversationType,
  DataSourceViewType,
  GenerationTokensEvent,
  PatchDataSourceViewType,
  PublicPostContentFragmentRequestBody,
  PublicPostConversationsRequestBody,
  PublicPostMessagesRequestBody,
  UserMessageErrorEvent,
  LoggerInterface,
  DustAppRunRunStatusEvent,
  DustAppRunBlockStatusEvent,
  DustAppRunBlockExecutionEvent,
  DustAppRunTokensEvent,
  DustAppRunFunctionCallEvent,
  DustAppRunFunctionCallArgumentsTokensEvent,
  DustAppRunFinalEvent,
  DustAPICredentials,
  DustAppConfigType,
  RunAppResponseType,
} from "./types";

import {
  APIErrorSchema,
  CreateConversationResponseSchema,
  CreateConversationResponseType,
  Err,
  GetActiveMemberEmailsInWorkspaceResponseSchema,
  GetActiveMemberEmailsInWorkspaceResponseType,
  GetAgentConfigurationsResponseSchema,
  GetAgentConfigurationsResponseType,
  GetConversationResponseSchema,
  GetConversationResponseType,
  GetDataSourcesResponseSchema,
  GetDataSourcesResponseType,
  GetWorkspaceFeatureFlagsResponseSchema,
  GetWorkspaceFeatureFlagsResponseType,
  GetWorkspaceVerifiedDomainsResponseSchema,
  GetWorkspaceVerifiedDomainsResponseType,
  Ok,
  PatchDataSourceViewsReponseType,
  PatchDataSourceViewsResponseSchema,
  PostContentFragmentResponseSchema,
  PostContentFragmentResponseType,
  PostUserMessageResponseSchema,
  PostUserMessageResponseType,
  Result,
  RunAppResponseSchema,
  SearchDataSourceViewsResponseSchema,
  SearchDataSourceViewsResponseType,
  TokenizeResponseSchema,
  TokenizeResponseType,
} from "./types";

export * from "./types";

import { createParser } from "eventsource-parser";

export function isAPIError(obj: unknown): obj is APIError {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "message" in obj &&
    typeof obj.message === "string" &&
    "type" in obj &&
    typeof obj.type === "string"
    // TODO(spolu): check type is a valid APIErrorType
  );
}

export const DustGroupIdsHeader = "X-Dust-Group-Ids";
export const DustUserEmailHeader = "x-api-user-email";

/**
 * This help functions process a streamed response in the format of the Dust API for running
 * streamed apps.
 *
 * @param res an HTTP response ready to be consumed as a stream
 */
async function processStreamedRunResponse(
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
          errorStr: JSON.stringify(e),
          errorSource: "processStreamedRunResponse",
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
  _url: string;
  _nodeEnv: string;
  _credentials: DustAPICredentials;
  _useLocalInDev: boolean;
  _logger: LoggerInterface;
  _urlOverride?: string;

  /**
   * @param credentials DustAPICrededentials
   */
  constructor(
    config: {
      url: string;
      nodeEnv: string;
    },
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
    this._url = config.url;
    this._nodeEnv = config.nodeEnv;
    this._credentials = credentials;
    this._logger = logger;
    this._useLocalInDev = useLocalInDev;
    this._urlOverride = urlOverride;
  }

  workspaceId(): string {
    return this._credentials.workspaceId;
  }

  apiUrl(): string {
    if (this._urlOverride) {
      return this._urlOverride;
    }
    return this._useLocalInDev && this._nodeEnv === "development"
      ? "http://localhost:3000"
      : this._url;
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
      appVaultId,
    }: {
      workspaceId: string;
      appId: string;
      appVaultId: string;
      appHash: string;
    },
    config: DustAppConfigType,
    inputs: unknown[],
    { useWorkspaceCredentials }: { useWorkspaceCredentials: boolean } = {
      useWorkspaceCredentials: false,
    }
  ) {
    let url = `${this.apiUrl()}/api/v1/w/${workspaceId}/vaults/${appVaultId}/apps/${appId}/runs`;
    if (useWorkspaceCredentials) {
      url += "?use_workspace_credentials=true";
    }

    const headers: RequestInit["headers"] = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this._credentials.apiKey}`,
    };
    if (this._credentials.groupIds) {
      headers[DustGroupIdsHeader] = this._credentials.groupIds.join(",");
    }

    const res = await this._fetchWithError(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        specification_hash: appHash,
        config: config,
        stream: false,
        blocking: true,
        inputs: inputs,
      }),
    });

    const r = await this._resultFromResponse<RunAppResponseType>(
      RunAppResponseSchema,
      res
    );

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
      appVaultId,
    }: {
      workspaceId: string;
      appId: string;
      appVaultId: string;
      appHash: string;
    },
    config: DustAppConfigType,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputs: any[],
    { useWorkspaceCredentials }: { useWorkspaceCredentials: boolean } = {
      useWorkspaceCredentials: false,
    }
  ) {
    let url = `${this.apiUrl()}/api/v1/w/${workspaceId}/vaults/${appVaultId}/apps/${appId}/runs`;
    if (useWorkspaceCredentials) {
      url += "?use_workspace_credentials=true";
    }

    const headers: RequestInit["headers"] = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this._credentials.apiKey}`,
    };
    if (this._credentials.groupIds) {
      headers[DustGroupIdsHeader] = this._credentials.groupIds.join(",");
    }

    const res = await this._fetchWithError(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        specification_hash: appHash,
        config: config,
        stream: true,
        blocking: false,
        inputs: inputs,
      }),
    });

    if (res.isErr()) {
      return res;
    }

    return processStreamedRunResponse(res.value.response, this._logger);
  }

  /**
   * This actions talks to the Dust production API to retrieve the list of data sources of the
   * specified workspace id.
   *
   * @param workspaceId string the workspace id to fetch data sources for
   */
  async getDataSources(workspaceId: string) {
    const res = await this._fetchWithError(
      `${this.apiUrl()}/api/v1/w/${workspaceId}/data_sources`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this._credentials.apiKey}`,
        },
      }
    );

    const r = await this._resultFromResponse<GetDataSourcesResponseType>(
      GetDataSourcesResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.data_sources);
  }

  async getAgentConfigurations() {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this._credentials.apiKey}`,
      "Content-Type": "application/json",
    };

    if (this._credentials.userEmail) {
      headers[DustUserEmailHeader] = this._credentials.userEmail;
    }

    if (this._credentials.groupIds) {
      headers[DustGroupIdsHeader] = this._credentials.groupIds.join(",");
    }

    const res = await this._fetchWithError(
      `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/assistant/agent_configurations`,
      {
        method: "GET",
        headers,
      }
    );

    const r =
      await this._resultFromResponse<GetAgentConfigurationsResponseType>(
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
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this._credentials.apiKey}`,
      "Content-Type": "application/json",
    };

    if (this._credentials.userEmail) {
      headers[DustUserEmailHeader] = this._credentials.userEmail;
    }

    if (this._credentials.groupIds) {
      headers[DustGroupIdsHeader] = this._credentials.groupIds.join(",");
    }

    const res = await this._fetchWithError(
      `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/assistant/conversations/${conversationId}/content_fragments`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...contentFragment,
        }),
      }
    );

    const r = await this._resultFromResponse<PostContentFragmentResponseType>(
      PostContentFragmentResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.contentFragment);
  }

  // When creating a conversation with a user message, the API returns only after the user message
  // was created (and if applicable the associated agent messages).
  async createConversation({
    title,
    visibility,
    message,
    contentFragment,
    blocking = false,
  }: PublicPostConversationsRequestBody) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this._credentials.apiKey}`,
      "Content-Type": "application/json",
    };

    if (this._credentials.userEmail) {
      headers[DustUserEmailHeader] = this._credentials.userEmail;
    }

    if (this._credentials.groupIds) {
      headers[DustGroupIdsHeader] = this._credentials.groupIds.join(",");
    }

    const res = await this._fetchWithError(
      `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/assistant/conversations`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          title,
          visibility,
          message,
          contentFragment,
          blocking,
        }),
      }
    );

    return this._resultFromResponse<CreateConversationResponseType>(
      CreateConversationResponseSchema,
      res
    );
  }

  async postUserMessage({
    conversationId,
    message,
  }: {
    conversationId: string;
    message: PublicPostMessagesRequestBody;
  }) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this._credentials.apiKey}`,
      "Content-Type": "application/json",
    };

    if (this._credentials.userEmail) {
      headers[DustUserEmailHeader] = this._credentials.userEmail;
    }

    if (this._credentials.groupIds) {
      headers[DustGroupIdsHeader] = this._credentials.groupIds.join(",");
    }

    const res = await this._fetchWithError(
      `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/assistant/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...message,
        }),
      }
    );

    const r = await this._resultFromResponse<PostUserMessageResponseType>(
      PostUserMessageResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.message);
  }

  async streamAgentMessageEvents({
    conversation,
    message,
  }: {
    conversation: ConversationType;
    message: AgentMessageType;
  }) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this._credentials.apiKey}`,
      "Content-Type": "application/json",
    };

    if (this._credentials.userEmail) {
      headers[DustUserEmailHeader] = this._credentials.userEmail;
    }

    if (this._credentials.groupIds) {
      headers[DustGroupIdsHeader] = this._credentials.groupIds.join(",");
    }

    const res = await this._fetchWithError(
      `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/assistant/conversations/${
        conversation.sId
      }/messages/${message.sId}/events`,
      {
        method: "GET",
        headers,
      }
    );

    if (res.isErr()) {
      return res;
    }

    if (!res.value.response.ok || !res.value.response.body) {
      return new Err({
        type: "dust_api_error",
        message: `Error running streamed app: status_code=${
          res.value.response.status
        }  - message=${await res.value.response.text()}`,
      });
    }

    let pendingEvents: (
      | UserMessageErrorEvent
      | AgentErrorEvent
      | AgentActionSuccessEvent
      | GenerationTokensEvent
      | AgentMessageSuccessEvent
      | AgentActionSpecificEvent
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
              case "agent_message_success": {
                pendingEvents.push(data as AgentMessageSuccessEvent);
                break;
              }
              case "retrieval_params":
              case "dust_app_run_params":
              case "dust_app_run_block":
              case "tables_query_params":
              case "tables_query_output":
              case "process_params":
              case "websearch_params":
              case "browse_params":
                pendingEvents.push(data as AgentActionSpecificEvent);
                break;
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

    const reader = res.value.response.body.getReader();
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
            errorStr: JSON.stringify(e),
            errorSource: "postUserMessage",
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
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this._credentials.apiKey}`,
      "Content-Type": "application/json",
    };

    if (this._credentials.userEmail) {
      headers[DustUserEmailHeader] = this._credentials.userEmail;
    }

    if (this._credentials.groupIds) {
      headers[DustGroupIdsHeader] = this._credentials.groupIds.join(",");
    }

    const res = await this._fetchWithError(
      `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/assistant/conversations/${conversationId}`,
      {
        method: "GET",
        headers,
      }
    );

    const r = await this._resultFromResponse<GetConversationResponseType>(
      GetConversationResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.conversation);
  }

  async tokenize(text: string, dataSourceId: string) {
    const endpoint = `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/data_sources/${dataSourceId}/tokenize`;

    const res = await this._fetchWithError(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._credentials.apiKey}`,
      },
      body: JSON.stringify({
        text,
      }),
    });

    const r = await this._resultFromResponse<TokenizeResponseType>(
      TokenizeResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.tokens);
  }

  async getActiveMemberEmailsInWorkspace() {
    const endpoint = `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/members/emails?activeOnly=true`;

    const res = await this._fetchWithError(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._credentials.apiKey}`,
      },
    });

    const r =
      await this._resultFromResponse<GetActiveMemberEmailsInWorkspaceResponseType>(
        GetActiveMemberEmailsInWorkspaceResponseSchema,
        res
      );
    if (r.isErr()) {
      return r;
    }

    return new Ok(r.value.emails);
  }

  async getWorkspaceVerifiedDomains() {
    const endpoint = `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/verified_domains`;

    const res = await this._fetchWithError(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._credentials.apiKey}`,
      },
    });

    const r =
      await this._resultFromResponse<GetWorkspaceVerifiedDomainsResponseType>(
        GetWorkspaceVerifiedDomainsResponseSchema,
        res
      );
    if (r.isErr()) {
      return r;
    }

    return new Ok(r.value.verified_domains);
  }

  async getWorkspaceFeatureFlags() {
    const endpoint = `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/feature_flags`;

    const res = await this._fetchWithError(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._credentials.apiKey}`,
      },
    });

    const r =
      await this._resultFromResponse<GetWorkspaceFeatureFlagsResponseType>(
        GetWorkspaceFeatureFlagsResponseSchema,
        res
      );
    if (r.isErr()) {
      return r;
    }

    return new Ok(r.value.feature_flags);
  }

  async searchDataSourceViews(searchParams: URLSearchParams) {
    const endpoint = `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/data_source_views/search?${searchParams.toString()}`;
    const res = await this._fetchWithError(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._credentials.apiKey}`,
      },
    });
    const r = await this._resultFromResponse<SearchDataSourceViewsResponseType>(
      SearchDataSourceViewsResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }

    return new Ok(r.value.data_source_views);
  }

  async patchDataSourceViews(
    dataSourceView: DataSourceViewType,
    patchData: PatchDataSourceViewType
  ) {
    const endpoint = `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/data_source_views/${
      dataSourceView.id
    }`;
    const res = await this._fetchWithError(endpoint, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._credentials.apiKey}`,
      },
      body: JSON.stringify(patchData),
    });
    const r = await this._resultFromResponse<PatchDataSourceViewsReponseType>(
      PatchDataSourceViewsResponseSchema,
      res
    );
    if (r.isErr()) {
      return r;
    }

    return new Ok(r.value.data_source_views);
  }

  private async _fetchWithError(
    url: string,
    init?: RequestInit
  ): Promise<Result<{ response: Response; duration: number }, APIError>> {
    const now = Date.now();
    try {
      const res = await fetch(url, init);
      return new Ok({ response: res, duration: Date.now() - now });
    } catch (e) {
      const duration = Date.now() - now;
      const err: APIError = {
        type: "unexpected_network_error",
        message: `Unexpected network error from DustAPI: ${e}`,
      };
      this._logger.error(
        {
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

  private async _resultFromResponse<T extends Object>(
    schema: z.ZodSchema,
    res: Result<
      {
        response: Response;
        duration: number;
      },
      APIError
    >
  ): Promise<Result<T, APIError>> {
    if (res.isErr()) {
      return res;
    }

    // We get the text and attempt to parse so that we can log the raw text in case of error (the
    // body is already consumed by response.json() if used otherwise).
    const text = await res.value.response.text();

    try {
      const json = schema.parse(text) as T;
      return new Ok(json);
    } catch (e) {
      try {
        // Expected error format
        const err: APIError = APIErrorSchema.parse(text);
        return new Err(err);
      } catch (e) {
        // Unexpected error format
        const err: APIError = {
          type: "unexpected_response_format",
          message: `Unexpected response format from DustAPI: ${e}`,
        };
        this._logger.error(
          {
            dustError: err,
            parseError: e,
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
}
