var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
import axios from "axios";
import { createParser } from "eventsource-parser";
import http from "http";
import https from "https";
import { APIErrorSchema, AppsCheckResponseSchema, CancelMessageGenerationResponseSchema, CreateConversationResponseSchema, DataSourceViewResponseSchema, DeleteFolderResponseSchema, Err, FileUploadRequestResponseSchema, GetActiveMemberEmailsInWorkspaceResponseSchema, GetAgentConfigurationsResponseSchema, GetAppsResponseSchema, GetConversationResponseSchema, GetConversationsResponseSchema, GetDataSourcesResponseSchema, GetFeedbacksResponseSchema, GetSpacesResponseSchema, GetWorkspaceFeatureFlagsResponseSchema, GetWorkspaceVerifiedDomainsResponseSchema, HeartbeatMCPResponseSchema, MeResponseSchema, Ok, PostContentFragmentResponseSchema, PostMCPResultsResponseSchema, PostMessageFeedbackResponseSchema, PostUserMessageResponseSchema, PostWorkspaceSearchResponseBodySchema, RegisterMCPResponseSchema, RunAppResponseSchema, SearchDataSourceViewsResponseSchema, TokenizeResponseSchema, UpsertFolderResponseSchema, ValidateActionResponseSchema, } from "./types";
export * from "./internal_mime_types";
export * from "./tool_input_schemas";
export * from "./types";
const textFromResponse = (response) => __awaiter(void 0, void 0, void 0, function* () {
    if (typeof response.body === "string") {
        return response.body;
    }
    const stream = response.body;
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        stream.on("error", reject);
    });
});
const axiosNoKeepAlive = axios.create({
    httpAgent: new http.Agent({ keepAlive: false }),
    httpsAgent: new https.Agent({ keepAlive: false }),
});
const sanitizedError = (e) => {
    if (axios.isAxiosError(e)) {
        return Object.assign(Object.assign({}, e), { config: undefined });
    }
    return e;
};
export class DustAPI {
    /**
     * @param credentials DustAPICrededentials
     */
    constructor(config, credentials, logger, urlOverride) {
        this._url = config.url;
        this._credentials = credentials;
        this._logger = logger;
        this._urlOverride = urlOverride;
    }
    workspaceId() {
        return this._credentials.workspaceId;
    }
    setWorkspaceId(workspaceId) {
        this._credentials.workspaceId = workspaceId;
    }
    apiUrl() {
        return this._urlOverride ? this._urlOverride : this._url;
    }
    getApiKey() {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof this._credentials.apiKey === "function") {
                return this._credentials.apiKey();
            }
            return this._credentials.apiKey;
        });
    }
    baseHeaders() {
        return __awaiter(this, void 0, void 0, function* () {
            const headers = {
                Authorization: `Bearer ${yield this.getApiKey()}`,
            };
            if (this._credentials.extraHeaders) {
                Object.assign(headers, this._credentials.extraHeaders);
            }
            return headers;
        });
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
    me() {
        return __awaiter(this, void 0, void 0, function* () {
            // This method call directly _fetchWithError and _resultFromResponse as it's a little special:
            // it doesn't live under the workspace resource.
            const headers = {
                "Content-Type": "application/json",
                Authorization: `Bearer ${yield this.getApiKey()}`,
            };
            const res = yield this._fetchWithError(`${this.apiUrl()}/api/v1/me`, {
                method: "GET",
                headers,
            });
            const r = yield this._resultFromResponse(MeResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.user);
        });
    }
    request(args) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            // Conveniently clean path from any leading "/" just in case
            args.path = args.path.replace(/^\/+/, "");
            let url = `${this.apiUrl()}/api/v1/w/${(_a = args.overrideWorkspaceId) !== null && _a !== void 0 ? _a : this.workspaceId()}/${args.path}`;
            if (args.query) {
                url += `?${args.query.toString()}`;
            }
            const headers = yield this.baseHeaders();
            headers["Content-Type"] = "application/json";
            const res = yield this._fetchWithError(url, {
                method: args.method,
                headers,
                data: args.body ? JSON.stringify(args.body) : undefined,
                signal: args.signal,
            });
            return res;
        });
    }
    /**
     * This functions talks directly to the Dust production API to create a run.
     *
     * @param app DustAppType the app to run streamed
     * @param config DustAppConfigType the app config
     * @param inputs any[] the app inputs
     */
    runApp(_a, config_1, inputs_1) {
        return __awaiter(this, arguments, void 0, function* ({ workspaceId, appId, appHash, appSpaceId, }, config, inputs, { useWorkspaceCredentials } = {
            useWorkspaceCredentials: false,
        }) {
            const res = yield this.request({
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
            const r = yield this._resultFromResponse(RunAppResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.run);
        });
    }
    /**
     * This functions talks directly to the Dust production API to create a streamed run.
     *
     * @param app DustAppType the app to run streamed
     * @param config DustAppConfigType the app config
     * @param inputs any[] the app inputs
     */
    runAppStreamed(_a, config_1, inputs_1) {
        return __awaiter(this, arguments, void 0, function* ({ workspaceId, appId, appHash, appSpaceId, }, config, 
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputs, { useWorkspaceCredentials } = {
            useWorkspaceCredentials: false,
        }) {
            const res = yield this.request({
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
            function processStreamedRunResponse(res, logger) {
                return __awaiter(this, void 0, void 0, function* () {
                    if (!res.ok || !res.body) {
                        return new Err({
                            type: "dust_api_error",
                            message: `Error running streamed app: status_code=${res.status}`,
                        });
                    }
                    let hasRunId = false;
                    let rejectDustRunIdPromise;
                    let resolveDustRunIdPromise;
                    const dustRunIdPromise = new Promise((resolve, reject) => {
                        rejectDustRunIdPromise = reject;
                        resolveDustRunIdPromise = resolve;
                    });
                    let pendingEvents = [];
                    const parser = createParser((event) => {
                        var _a;
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
                                            });
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
                                            });
                                            break;
                                        }
                                        case "function_call": {
                                            pendingEvents.push({
                                                type: "function_call",
                                                content: data.content,
                                            });
                                            break;
                                        }
                                        case "function_call_arguments_tokens": {
                                            pendingEvents.push({
                                                type: "function_call_arguments_tokens",
                                                content: data.content,
                                            });
                                            break;
                                        }
                                        case "final": {
                                            pendingEvents.push({
                                                type: "final",
                                            });
                                        }
                                    }
                                    if (((_a = data.content) === null || _a === void 0 ? void 0 : _a.run_id) && !hasRunId) {
                                        hasRunId = true;
                                        resolveDustRunIdPromise(data.content.run_id);
                                    }
                                }
                                catch (err) {
                                    logger.error({ error: err }, "Failed parsing chunk from Dust API");
                                }
                            }
                        }
                    });
                    const reader = res.body;
                    const streamEvents = function () {
                        return __asyncGenerator(this, arguments, function* () {
                            var _a, e_1, _b, _c;
                            try {
                                try {
                                    for (var _d = true, reader_1 = __asyncValues(reader), reader_1_1; reader_1_1 = yield __await(reader_1.next()), _a = reader_1_1.done, !_a; _d = true) {
                                        _c = reader_1_1.value;
                                        _d = false;
                                        const chunk = _c;
                                        parser.feed(new TextDecoder().decode(chunk));
                                        for (const event of pendingEvents) {
                                            yield yield __await(event);
                                        }
                                        pendingEvents = [];
                                    }
                                }
                                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                                finally {
                                    try {
                                        if (!_d && !_a && (_b = reader_1.return)) yield __await(_b.call(reader_1));
                                    }
                                    finally { if (e_1) throw e_1.error; }
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
                            }
                            catch (e) {
                                logger.error({
                                    error: e,
                                    errorStr: JSON.stringify(e),
                                    errorSource: "processStreamedRunResponse",
                                }, "DustAPI error: streaming chunks");
                                yield yield __await({
                                    type: "error",
                                    content: {
                                        code: "stream_error",
                                        message: "Error streaming chunks",
                                    },
                                });
                            }
                        });
                    };
                    return new Ok({
                        eventStream: streamEvents(),
                        dustRunId: dustRunIdPromise,
                    });
                });
            }
            return processStreamedRunResponse(res.value.response, this._logger);
        });
    }
    /**
     * This actions talks to the Dust production API to retrieve the list of data sources of the
     * current workspace.
     */
    getDataSources() {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.request({
                method: "GET",
                path: "data_sources",
            });
            const r = yield this._resultFromResponse(GetDataSourcesResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.data_sources);
        });
    }
    getAgentConfigurations(_a) {
        return __awaiter(this, arguments, void 0, function* ({ view, includes = [], }) {
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
            const res = yield this.request({
                path,
                method: "GET",
            });
            const r = yield this._resultFromResponse(GetAgentConfigurationsResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.agentConfigurations);
        });
    }
    postContentFragment(_a) {
        return __awaiter(this, arguments, void 0, function* ({ conversationId, contentFragment, }) {
            const res = yield this.request({
                method: "POST",
                path: `assistant/conversations/${conversationId}/content_fragments`,
                body: Object.assign({}, contentFragment),
            });
            const r = yield this._resultFromResponse(PostContentFragmentResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.contentFragment);
        });
    }
    // When creating a conversation with a user message, the API returns only after the user message
    // was created (and if applicable the associated agent messages).
    createConversation(_a) {
        return __awaiter(this, arguments, void 0, function* ({ title, visibility, message, contentFragment, contentFragments, blocking = false, }) {
            const res = yield this.request({
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
        });
    }
    postUserMessage(_a) {
        return __awaiter(this, arguments, void 0, function* ({ conversationId, message, }) {
            const res = yield this.request({
                method: "POST",
                path: `assistant/conversations/${conversationId}/messages`,
                body: Object.assign({}, message),
            });
            const r = yield this._resultFromResponse(PostUserMessageResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.message);
        });
    }
    streamAgentAnswerEvents(_a) {
        return __awaiter(this, arguments, void 0, function* ({ conversation, userMessageId, signal, }) {
            // find the agent message with the parentMessageId equal to the user message id
            const agentMessages = conversation.content
                .map((versions) => {
                const m = versions[versions.length - 1];
                return m;
            })
                .filter((m) => {
                return (m && m.type === "agent_message" && m.parentMessageId === userMessageId);
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
        });
    }
    streamAgentMessageEvents(_a) {
        return __awaiter(this, arguments, void 0, function* ({ conversation, agentMessage, signal, }) {
            const res = yield this.request({
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
                    message: `Error running streamed app: status_code=${res.value.response.status}  - message=${yield textFromResponse(res.value.response)}`,
                });
            }
            let pendingEvents = [];
            const parser = createParser((event) => {
                if (event.type === "event") {
                    if (event.data) {
                        try {
                            const data = JSON.parse(event.data).data;
                            // TODO: shall we use the schema to validate the data?
                            switch (data.type) {
                                case "user_message_error": {
                                    pendingEvents.push(data);
                                    break;
                                }
                                case "agent_error": {
                                    pendingEvents.push(data);
                                    break;
                                }
                                case "agent_action_success": {
                                    pendingEvents.push(data);
                                    break;
                                }
                                case "generation_tokens": {
                                    pendingEvents.push(data);
                                    break;
                                }
                                case "agent_message_success": {
                                    pendingEvents.push(data);
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
                                    pendingEvents.push(data);
                                    break;
                            }
                        }
                        catch (err) {
                            this._logger.error({ error: err }, "Failed parsing chunk from Dust API");
                        }
                    }
                }
            });
            const reader = res.value.response.body;
            const logger = this._logger;
            const streamEvents = function () {
                return __asyncGenerator(this, arguments, function* () {
                    var _a, e_2, _b, _c;
                    try {
                        try {
                            for (var _d = true, reader_2 = __asyncValues(reader), reader_2_1; reader_2_1 = yield __await(reader_2.next()), _a = reader_2_1.done, !_a; _d = true) {
                                _c = reader_2_1.value;
                                _d = false;
                                const chunk = _c;
                                parser.feed(new TextDecoder().decode(chunk));
                                for (const event of pendingEvents) {
                                    yield yield __await(event);
                                }
                                pendingEvents = [];
                            }
                        }
                        catch (e_2_1) { e_2 = { error: e_2_1 }; }
                        finally {
                            try {
                                if (!_d && !_a && (_b = reader_2.return)) yield __await(_b.call(reader_2));
                            }
                            finally { if (e_2) throw e_2.error; }
                        }
                    }
                    catch (e) {
                        logger.error({
                            error: e,
                            errorStr: JSON.stringify(e),
                            errorSource: "streamAgentAnswerEvents",
                        }, "DustAPI error: streaming chunks");
                        yield yield __await({
                            type: "error",
                            content: {
                                code: "stream_error",
                                message: "Error streaming chunks",
                            },
                        });
                    }
                });
            };
            return new Ok({ eventStream: streamEvents() });
        });
    }
    cancelMessageGeneration(_a) {
        return __awaiter(this, arguments, void 0, function* ({ conversationId, messageIds, }) {
            const res = yield this.request({
                method: "POST",
                path: `assistant/conversations/${conversationId}/cancel`,
                body: {
                    messageIds,
                },
            });
            const r = yield this._resultFromResponse(CancelMessageGenerationResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            else {
                return new Ok(r.value);
            }
        });
    }
    getConversations() {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.request({
                method: "GET",
                path: `assistant/conversations`,
            });
            const r = yield this._resultFromResponse(GetConversationsResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.conversations);
        });
    }
    getConversation(_a) {
        return __awaiter(this, arguments, void 0, function* ({ conversationId }) {
            const res = yield this.request({
                method: "GET",
                path: `assistant/conversations/${conversationId}`,
            });
            const r = yield this._resultFromResponse(GetConversationResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.conversation);
        });
    }
    getConversationFeedback(_a) {
        return __awaiter(this, arguments, void 0, function* ({ conversationId, }) {
            const res = yield this.request({
                method: "GET",
                path: `assistant/conversations/${conversationId}/feedbacks`,
            });
            const r = yield this._resultFromResponse(GetFeedbacksResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.feedbacks);
        });
    }
    postFeedback(conversationId, messageId, feedback) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.request({
                method: "POST",
                path: `assistant/conversations/${conversationId}/messages/${messageId}/feedbacks`,
                body: feedback,
            });
            return this._resultFromResponse(PostMessageFeedbackResponseSchema, res);
        });
    }
    deleteFeedback(conversationId, messageId) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.request({
                method: "DELETE",
                path: `assistant/conversations/${conversationId}/messages/${messageId}/feedbacks`,
            });
            return this._resultFromResponse(PostMessageFeedbackResponseSchema, res);
        });
    }
    tokenize(text, dataSourceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.request({
                method: "POST",
                path: `data_sources/${dataSourceId}/tokenize`,
                body: { text },
            });
            const r = yield this._resultFromResponse(TokenizeResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.tokens);
        });
    }
    upsertFolder(_a) {
        return __awaiter(this, arguments, void 0, function* ({ dataSourceId, folderId, timestamp, title, parentId, parents, mimeType, sourceUrl, providerVisibility, }) {
            const res = yield this.request({
                method: "POST",
                path: `data_sources/${dataSourceId}/folders/${encodeURIComponent(folderId)}`,
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
            const r = yield this._resultFromResponse(UpsertFolderResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value);
        });
    }
    deleteFolder(_a) {
        return __awaiter(this, arguments, void 0, function* ({ dataSourceId, folderId, }) {
            const res = yield this.request({
                method: "DELETE",
                path: `data_sources/${dataSourceId}/folders/${encodeURIComponent(folderId)}`,
            });
            const r = yield this._resultFromResponse(DeleteFolderResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value);
        });
    }
    uploadFile(_a) {
        return __awaiter(this, arguments, void 0, function* ({ contentType, fileName, fileSize, useCase, useCaseMetadata, fileObject, }) {
            var _b, _c, _d;
            const res = yield this.request({
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
            const fileRes = yield this._resultFromResponse(FileUploadRequestResponseSchema, res);
            if (fileRes.isErr()) {
                return fileRes;
            }
            const { file } = fileRes.value;
            const formData = new FormData();
            formData.append("file", fileObject);
            // Upload file to the obtained URL.
            try {
                const { data: { file: fileUploaded }, } = yield axiosNoKeepAlive.post(file.uploadUrl, formData, { headers: yield this.baseHeaders() });
                return new Ok(fileUploaded);
            }
            catch (err) {
                if (axios.isAxiosError(err)) {
                    return new Err(new Error(((_d = (_c = (_b = err.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.error) === null || _d === void 0 ? void 0 : _d.message) || "Failed to upload file"));
                }
                return new Err(new Error(err instanceof Error ? err.message : "Unknown error"));
            }
        });
    }
    deleteFile(_a) {
        return __awaiter(this, arguments, void 0, function* ({ fileID }) {
            const res = yield this.request({
                method: "DELETE",
                path: `files/${fileID}`,
            });
            return res;
        });
    }
    getActiveMemberEmailsInWorkspace() {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.request({
                method: "GET",
                path: "members/emails",
                query: new URLSearchParams({ activeOnly: "true" }),
            });
            const r = yield this._resultFromResponse(GetActiveMemberEmailsInWorkspaceResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.emails);
        });
    }
    getWorkspaceVerifiedDomains() {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.request({
                method: "GET",
                path: "verified_domains",
            });
            const r = yield this._resultFromResponse(GetWorkspaceVerifiedDomainsResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.verified_domains);
        });
    }
    getWorkspaceFeatureFlags() {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.request({
                method: "GET",
                path: "feature_flags",
            });
            const r = yield this._resultFromResponse(GetWorkspaceFeatureFlagsResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.feature_flags);
        });
    }
    searchDataSourceViews(searchParams) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.request({
                method: "GET",
                path: "data_source_views/search",
                query: searchParams,
            });
            const r = yield this._resultFromResponse(SearchDataSourceViewsResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.data_source_views);
        });
    }
    patchDataSourceView(dataSourceView, patch) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.request({
                method: "PATCH",
                path: `spaces/${dataSourceView.spaceId}/data_source_views/${dataSourceView.sId}`,
                body: patch,
            });
            const r = yield this._resultFromResponse(DataSourceViewResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.dataSourceView);
        });
    }
    exportApps(_a) {
        return __awaiter(this, arguments, void 0, function* ({ appSpaceId }) {
            const res = yield this.request({
                method: "GET",
                path: `spaces/${appSpaceId}/apps/export`,
            });
            const r = yield this._resultFromResponse(GetAppsResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.apps);
        });
    }
    checkApps(apps, appSpaceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.request({
                method: "POST",
                path: `spaces/${appSpaceId}/apps/check`,
                body: apps,
            });
            const r = yield this._resultFromResponse(AppsCheckResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.apps);
        });
    }
    getSpaces() {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.request({
                method: "GET",
                path: "spaces",
            });
            const r = yield this._resultFromResponse(GetSpacesResponseSchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.spaces);
        });
    }
    searchNodes(searchParams) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.request({
                method: "POST",
                path: "search",
                body: searchParams,
            });
            const r = yield this._resultFromResponse(PostWorkspaceSearchResponseBodySchema, res);
            if (r.isErr()) {
                return r;
            }
            return new Ok(r.value.nodes);
        });
    }
    _fetchWithError(url, config) {
        return __awaiter(this, void 0, void 0, function* () {
            const now = Date.now();
            try {
                const res = yield axiosNoKeepAlive(url, Object.assign({ validateStatus: () => true, responseType: "stream" }, config));
                const response = {
                    status: res.status,
                    url: res.config.url || url,
                    body: res.data,
                    ok: res.status >= 200 && res.status < 300,
                };
                return new Ok({ response, duration: Date.now() - now });
            }
            catch (e) {
                const duration = Date.now() - now;
                const err = {
                    type: "unexpected_network_error",
                    message: `Unexpected network error from DustAPI: ${e}`,
                };
                this._logger.error({
                    dustError: err,
                    url,
                    duration,
                    connectorsError: err,
                    error: sanitizedError(e),
                }, "DustAPI error");
                return new Err(err);
            }
        });
    }
    // MCP Related.
    validateAction(_a) {
        return __awaiter(this, arguments, void 0, function* ({ conversationId, messageId, actionId, approved, }) {
            const res = yield this.request({
                method: "POST",
                path: `assistant/conversations/${conversationId}/messages/${messageId}/validate-action`,
                body: {
                    actionId,
                    approved,
                },
            });
            return this._resultFromResponse(ValidateActionResponseSchema, res);
        });
    }
    registerMCPServer(_a) {
        return __awaiter(this, arguments, void 0, function* ({ serverId, }) {
            const res = yield this.request({
                method: "POST",
                path: "mcp/register",
                body: {
                    serverId,
                },
            });
            return this._resultFromResponse(RegisterMCPResponseSchema, res);
        });
    }
    heartbeatMCPServer(_a) {
        return __awaiter(this, arguments, void 0, function* ({ serverId, }) {
            const res = yield this.request({
                method: "POST",
                path: "mcp/heartbeat",
                body: {
                    serverId,
                },
            });
            return this._resultFromResponse(HeartbeatMCPResponseSchema, res);
        });
    }
    postMCPResults(_a) {
        return __awaiter(this, arguments, void 0, function* ({ requestId, result, serverId, }) {
            const params = new URLSearchParams();
            params.set("serverId", serverId);
            const res = yield this.request({
                method: "POST",
                path: `mcp/results?${params.toString()}`,
                body: {
                    requestId,
                    result,
                },
            });
            return this._resultFromResponse(PostMCPResultsResponseSchema, res);
        });
    }
    getMCPRequestsConnectionDetails(_a) {
        return __awaiter(this, arguments, void 0, function* ({ serverId, lastEventId, }) {
            const url = `${this.apiUrl()}/api/v1/w/${this.workspaceId()}/mcp/requests`;
            const params = new URLSearchParams(Object.assign({ serverId }, (lastEventId ? { lastEventId } : {})));
            const headers = yield this.baseHeaders();
            return new Ok({
                url: `${url}?${params.toString()}`,
                headers,
            });
        });
    }
    _resultFromResponse(schema, res) {
        return __awaiter(this, void 0, void 0, function* () {
            if (res.isErr()) {
                return res;
            }
            if (res.value.response.status === 413) {
                const err = {
                    type: "content_too_large",
                    message: "Your request content is too large, please try again with a shorter content.",
                };
                this._logger.error({
                    dustError: err,
                    status: res.value.response.status,
                    url: res.value.response.url,
                    duration: res.value.duration,
                }, "DustAPI error");
                return new Err(err);
            }
            // We get the text and attempt to parse so that we can log the raw text in case of error (the
            // body is already consumed by response.json() if used otherwise).
            const text = yield textFromResponse(res.value.response);
            try {
                const response = JSON.parse(text);
                const r = schema.safeParse(response);
                // This assume that safe parsing means a 200 status.
                if (r.success) {
                    return new Ok(r.data);
                }
                else {
                    // We couldn't parse the response directly, maybe it's an error
                    const rErr = APIErrorSchema.safeParse(response["error"]);
                    if (rErr.success) {
                        // Successfully parsed an error
                        this._logger.error({
                            dustError: rErr.data,
                            status: res.value.response.status,
                            url: res.value.response.url,
                            duration: res.value.duration,
                        }, "DustAPI error");
                        return new Err(rErr.data);
                    }
                    else {
                        // Unexpected response format (neither an error nor a valid response)
                        const err = {
                            type: "unexpected_response_format",
                            message: `Unexpected response format from DustAPI calling ` +
                                `${res.value.response.url} : ${r.error.message}`,
                        };
                        this._logger.error({
                            dustError: err,
                            parseError: r.error.message,
                            rawText: text,
                            status: res.value.response.status,
                            url: res.value.response.url,
                            duration: res.value.duration,
                        }, "DustAPI error");
                        return new Err(err);
                    }
                }
            }
            catch (e) {
                const err = {
                    type: "unexpected_response_format",
                    message: `Fail to parse response from DustAPI calling ` +
                        `${res.value.response.url} : ${e}`,
                };
                this._logger.error({
                    dustError: err,
                    error: e,
                    rawText: text,
                    status: res.value.response.status,
                    url: res.value.response.url,
                    duration: res.value.duration,
                }, "DustAPI error");
                return new Err(err);
            }
        });
    }
}
//# sourceMappingURL=index.js.map