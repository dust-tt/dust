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
  ConversationType,
  UserMessageType,
} from "../../front/assistant/conversation";
import { DataSourceType } from "../../front/data_source";
import { CoreAPITokenType } from "../../front/lib/core_api";
import { RunType } from "../../front/run";
import { WorkspaceDomain } from "../../front/workspace";
import { WhitelistableFeature } from "../../shared/feature_flags";
import { LoggerInterface } from "../../shared/logger";
import { Err, Ok, Result } from "../../shared/result";
import { PatchDataSourceViewType } from "../api_handlers/public/vaults";
import { ContentFragmentType } from "../content_fragment";
import { DataSourceViewType } from "../data_source_view";
import {
  AgentActionSpecificEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentMessageSuccessEvent,
} from "./api/assistant/agent";
import { UserMessageErrorEvent } from "./api/assistant/conversation";
import { GenerationTokensEvent } from "./api/assistant/generation";
import { APIError, isAPIError } from "./error";

export type DustAppType = {
  appHash: string;
  appId: string;
  workspaceId: string;
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
  // Dust system API keys can request to be authenticated as a list of specific group IDs.
  // This is for internal use only.
  groupIds?: string[];
  // Dust system API keys can request to be authenticated as a specific user email.
  // This is for internal use only.
  userEmail?: string;
};

export const DustGroupIdsHeader = "X-Dust-Group-Ids";
export const DustUserEmailHeader = "x-api-user-email";

type PublicPostContentFragmentRequestBody = t.TypeOf<
  typeof PublicPostContentFragmentRequestBodySchema
>;

export type DustAPIResponse<T> = Result<T, APIError>;

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

  apiUrl() {
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
  ): Promise<DustAPIResponse<RunType>> {
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

    const r: DustAPIResponse<{ run: RunType }> = await this._resultFromResponse(
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
  async getDataSources(
    workspaceId: string
  ): Promise<DustAPIResponse<DataSourceType[]>> {
    const res = await this._fetchWithError(
      `${this.apiUrl()}/api/v1/w/${workspaceId}/data_sources`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this._credentials.apiKey}`,
        },
      }
    );

    const r: DustAPIResponse<{ data_sources: DataSourceType[] }> =
      await this._resultFromResponse(res);
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.data_sources);
  }

  async getAgentConfigurations(): Promise<
    DustAPIResponse<LightAgentConfigurationType[]>
  > {
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

    const r: DustAPIResponse<{
      agentConfigurations: LightAgentConfigurationType[];
    }> = await this._resultFromResponse(res);
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
  }): Promise<DustAPIResponse<ContentFragmentType>> {
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

    const r: DustAPIResponse<{ contentFragment: ContentFragmentType }> =
      await this._resultFromResponse(res);
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
  }: t.TypeOf<typeof PublicPostConversationsRequestBodySchema>): Promise<
    DustAPIResponse<{
      conversation: ConversationType;
      message: UserMessageType;
    }>
  > {
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

    return this._resultFromResponse(res);
  }

  async postUserMessage({
    conversationId,
    message,
  }: {
    conversationId: string;
    message: t.TypeOf<typeof PublicPostMessagesRequestBodySchema>;
  }): Promise<DustAPIResponse<UserMessageType>> {
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

    const r: DustAPIResponse<{ message: UserMessageType }> =
      await this._resultFromResponse(res);
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

  async getConversation({
    conversationId,
  }: {
    conversationId: string;
  }): Promise<DustAPIResponse<ConversationType>> {
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

    const r: DustAPIResponse<{ conversation: ConversationType }> =
      await this._resultFromResponse(res);
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.conversation);
  }

  async tokenize(
    text: string,
    dataSourceId: string
  ): Promise<DustAPIResponse<CoreAPITokenType[]>> {
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

    const r: DustAPIResponse<{ tokens: CoreAPITokenType[] }> =
      await this._resultFromResponse(res);
    if (r.isErr()) {
      return r;
    }
    return new Ok(r.value.tokens);
  }

  async getActiveMemberEmailsInWorkspace(): Promise<DustAPIResponse<string[]>> {
    const endpoint = `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/members/emails?activeOnly=true`;

    const res = await this._fetchWithError(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._credentials.apiKey}`,
      },
    });

    const r: DustAPIResponse<{ emails: string[] }> =
      await this._resultFromResponse(res);
    if (r.isErr()) {
      return r;
    }

    return new Ok(r.value.emails);
  }

  async getWorkspaceVerifiedDomains(): Promise<
    DustAPIResponse<WorkspaceDomain[]>
  > {
    const endpoint = `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/verified_domains`;

    const res = await this._fetchWithError(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._credentials.apiKey}`,
      },
    });

    const r: DustAPIResponse<{ verified_domains: WorkspaceDomain[] }> =
      await this._resultFromResponse(res);
    if (r.isErr()) {
      return r;
    }

    return new Ok(r.value.verified_domains);
  }

  async getWorkspaceFeatureFlags(): Promise<
    DustAPIResponse<WhitelistableFeature[]>
  > {
    const endpoint = `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/feature_flags`;

    const res = await this._fetchWithError(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._credentials.apiKey}`,
      },
    });

    const r: DustAPIResponse<{ feature_flags: WhitelistableFeature[] }> =
      await this._resultFromResponse(res);
    if (r.isErr()) {
      return r;
    }

    return new Ok(r.value.feature_flags);
  }

  async searchDataSourceViews(
    searchParams: URLSearchParams
  ): Promise<DustAPIResponse<DataSourceViewType[]>> {
    const endpoint = `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/data_source_views/search?${searchParams.toString()}`;
    const res = await this._fetchWithError(endpoint, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._credentials.apiKey}`,
      },
    });
    const r: DustAPIResponse<{ data_source_views: DataSourceViewType[] }> =
      await this._resultFromResponse(res);
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
    const r: DustAPIResponse<{ data_source_views: DataSourceViewType[] }> =
      await this._resultFromResponse(res);
    if (r.isErr()) {
      return r;
    }

    return new Ok(undefined);
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

  private async _resultFromResponse<T>(
    res: Result<
      {
        response: Response;
        duration: number;
      },
      APIError
    >
  ): Promise<DustAPIResponse<T>> {
    if (res.isErr()) {
      return res;
    }

    // We get the text and attempt to parse so that we can log the raw text in case of error (the
    // body is already consumed by response.json() if used otherwise).
    const text = await res.value.response.text();

    let json = null;
    try {
      json = JSON.parse(text);
    } catch (e) {
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

    if (!res.value.response.ok) {
      const err = json?.error;
      if (isAPIError(err)) {
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
      } else {
        const err: APIError = {
          type: "unexpected_error_format",
          message: "Unexpected error format from DustAPI",
        };
        this._logger.error(
          {
            dustError: err,
            json,
            status: res.value.response.status,
            url: res.value.response.url,
            duration: res.value.duration,
          },
          "DustAPI error"
        );
        return new Err(err);
      }
    } else {
      return new Ok(json);
    }
  }
}
