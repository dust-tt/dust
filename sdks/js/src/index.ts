import type { AxiosRequestConfig } from "axios";
import axios from "axios";
import { createParser } from "eventsource-parser";
import http from "http";
import https from "https";
import { Readable } from "stream";
import { z } from "zod";

import type {
  AgentActionSpecificEvent,
  AgentActionSuccessEvent,
  AgentConfigurationViewType,
  AgentErrorEvent,
  AgentMessagePublicType,
  AgentMessageSuccessEvent,
  APIError,
  AppsCheckRequestType,
  CancelMessageGenerationRequestType,
  ConversationPublicType,
  DataSourceViewType,
  DustAPICredentials,
  DustAppConfigType,
  DustAppRunBlockExecutionEvent,
  DustAppRunBlockStatusEvent,
  DustAppRunErroredEvent,
  DustAppRunFinalEvent,
  DustAppRunFunctionCallArgumentsTokensEvent,
  DustAppRunFunctionCallEvent,
  DustAppRunRunStatusEvent,
  DustAppRunTokensEvent,
  FileUploadedRequestResponseType,
  FileUploadUrlRequestType,
  GenerationTokensEvent,
  LoggerInterface,
  PatchDataSourceViewRequestType,
  PublicPostContentFragmentRequestBody,
  PublicPostConversationsRequestBody,
  PublicPostMessageFeedbackRequestBody,
  PublicPostMessagesRequestBody,
  UserMessageErrorEvent,
} from "./types";
import {
  APIErrorSchema,
  AppsCheckResponseSchema,
  CancelMessageGenerationResponseSchema,
  CreateConversationResponseSchema,
  DataSourceViewResponseSchema,
  DeleteFolderResponseSchema,
  Err,
  FileUploadRequestResponseSchema,
  GetActiveMemberEmailsInWorkspaceResponseSchema,
  GetAgentConfigurationsResponseSchema,
  GetAppsResponseSchema,
  GetConversationResponseSchema,
  GetConversationsResponseSchema,
  GetDataSourcesResponseSchema,
  GetFeedbacksResponseSchema,
  GetWorkspaceFeatureFlagsResponseSchema,
  GetWorkspaceVerifiedDomainsResponseSchema,
  MeResponseSchema,
  Ok,
  PostContentFragmentResponseSchema,
  PostMessageFeedbackResponseSchema,
  PostUserMessageResponseSchema,
  Result,
  RunAppResponseSchema,
  SearchDataSourceViewsResponseSchema,
  TokenizeResponseSchema,
  UpsertFolderResponseSchema,
} from "./types";

export * from "./types";

interface DustResponse {
  status: number;
  ok: boolean;
  url: string;
  body: Readable | string;
}

const textFromResponse = async (response: DustResponse): Promise<string> => {
  if (typeof response.body === "string") {
    return response.body;
  }

  const stream = response.body;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    stream.on("error", reject);
  });
};

const axiosNoKeepAlive = axios.create({
  httpAgent: new http.Agent({ keepAlive: false }),
  httpsAgent: new https.Agent({ keepAlive: false }),
});

const sanitizedError = (e: unknown) => {
  if (axios.isAxiosError(e)) {
    return {
      ...e,
      config: undefined,
    };
  }
  return e;
};

type RequestArgsType = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: URLSearchParams;
  body?: Record<string, unknown>;
  overrideWorkspaceId?: string;
  signal?: AbortSignal;
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

    const headers = await this.baseHeaders();
    headers["Content-Type"] = "application/json";

    const res = await this._fetchWithError(url, {
      method: args.method,
      headers,
      data: args.body ? JSON.stringify(args.body) : undefined,
      signal: args.signal,
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
              logger.error(
                { error: err },
                "Failed parsing chunk from Dust API"
              );
            }
          }
        }
      });

      const reader = res.body;

      const streamEvents = async function* () {
        try {
          for await (const chunk of reader) {
            parser.feed(new TextDecoder().decode(chunk));
            for (const event of pendingEvents) {
              yield event;
            }
            pendingEvents = [];
          }
          // while (true) {
          //   const { done, value } = await reader.read();
          //   if (done) {
          //     break;
          //   }
          //   parser.feed(new TextDecoder().decode(value));
          //   for (const event of pendingEvents) {
          //     yield event;
          //   }
          //   pendingEvents = [];
          // }
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

  // When creating a conversation with a user message, the API returns only after the user message
  // was created (and if applicable the associated agent messages).
  async createConversation({
    title,
    visibility,
    message,
    contentFragment,
    contentFragments,
    blocking = false,
  }: PublicPostConversationsRequestBody) {
    const res = await this.request({
      method: "POST",
      path: "assistant/conversations",
      body: {
        title,
        visibility,
        message,
        contentFragment,
        contentFragments,
        blocking,
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
  }: {
    conversation: ConversationPublicType;
    userMessageId: string;
    signal?: AbortSignal;
  }) {
    // find the agent message with the parentMessageId equal to the user message id
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
    });
  }

  async streamAgentMessageEvents({
    conversation,
    agentMessage,
    signal,
  }: {
    conversation: ConversationPublicType;
    agentMessage: AgentMessagePublicType;
    signal?: AbortSignal;
  }) {
    const res = await this.request({
      method: "GET",
      path: `assistant/conversations/${conversation.sId}/messages/${agentMessage.sId}/events`,
      signal,
    });

    if (res.isErr()) {
      return res;
    }

    if (!res.value.response.ok || !res.value.response.body) {
      return new Err({
        type: "dust_api_error",
        message: `Error running streamed app: status_code=${
          res.value.response.status
        }  - message=${await textFromResponse(res.value.response)}`,
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
            // TODO: shall we use the schema to validate the data?
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
              case "browse_params":
              case "dust_app_run_block":
              case "dust_app_run_params":
              case "process_params":
              case "retrieval_params":
              case "search_labels_params":
              case "tables_query_output":
              case "tables_query_params":
              case "websearch_params":
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

    const reader = res.value.response.body;
    const logger = this._logger;

    const streamEvents = async function* () {
      try {
        for await (const chunk of reader) {
          parser.feed(new TextDecoder().decode(chunk));
          for (const event of pendingEvents) {
            yield event;
          }
          pendingEvents = [];
        }
      } catch (e) {
        logger.error(
          {
            error: e,
            errorStr: JSON.stringify(e),
            errorSource: "streamAgentAnswerEvents",
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

    return new Ok({ eventStream: streamEvents() });
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

  async tokenize(text: string, dataSourceId: string) {
    const res = await this.request({
      method: "POST",
      path: `data_sources/${dataSourceId}/tokenize`,
      body: { text },
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
      const {
        data: { file: fileUploaded },
      } = await axiosNoKeepAlive.post<FileUploadedRequestResponseType>(
        file.uploadUrl,
        formData,
        { headers: await this.baseHeaders() }
      );
      return new Ok(fileUploaded);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        return new Err(
          new Error(
            err.response?.data?.error?.message || "Failed to upload file"
          )
        );
      }
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

  private async _fetchWithError(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<Result<{ response: DustResponse; duration: number }, APIError>> {
    const now = Date.now();
    try {
      const res = await axiosNoKeepAlive<Readable | string>(url, {
        validateStatus: () => true,
        responseType: "stream",
        ...config,
      });
      const response: DustResponse = {
        status: res.status,
        url: res.config.url || url,
        body: res.data,
        ok: res.status >= 200 && res.status < 300,
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
          error: sanitizedError(e),
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
