/// <reference types="node" />
import { Readable } from "stream";
import type { AgentConfigurationViewType, AgentMessagePublicType, APIError, AppsCheckRequestType, ConversationPublicType, DataSourceViewType, DustAPICredentials, DustAppConfigType, FileUploadUrlRequestType, HeartbeatMCPResponseType, LoggerInterface, PatchDataSourceViewRequestType, PostMCPResultsResponseType, PublicPostContentFragmentRequestBody, PublicPostConversationsRequestBody, PublicPostMCPResultsRequestBody, PublicPostMessageFeedbackRequestBody, PublicPostMessagesRequestBody, RegisterMCPResponseType, SearchRequestBodyType, ValidateActionRequestBodyType, ValidateActionResponseType } from "./types";
import { Err, Ok, Result } from "./types";
export * from "./internal_mime_types";
export * from "./tool_input_schemas";
export * from "./types";
interface DustResponse {
    status: number;
    ok: boolean;
    url: string;
    body: Readable | string;
}
type RequestArgsType = {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    path: string;
    query?: URLSearchParams;
    body?: Record<string, unknown>;
    overrideWorkspaceId?: string;
    signal?: AbortSignal;
};
export declare class DustAPI {
    _url: string;
    _credentials: DustAPICredentials;
    _logger: LoggerInterface;
    _urlOverride: string | undefined | null;
    /**
     * @param credentials DustAPICrededentials
     */
    constructor(config: {
        url: string;
    }, credentials: DustAPICredentials, logger: LoggerInterface, urlOverride?: string | undefined | null);
    workspaceId(): string;
    setWorkspaceId(workspaceId: string): void;
    apiUrl(): string;
    getApiKey(): Promise<string | null>;
    baseHeaders(): Promise<Record<string, string>>;
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
    me(): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        sId: string;
        id: number;
        createdAt: number;
        provider: "github" | "auth0" | "google" | "okta" | "samlp" | "waad" | null;
        username: string;
        email: string;
        firstName: string;
        lastName: string | null;
        fullName: string;
        image: string | null;
    } & {
        workspaces: {
            sId: string;
            id: number;
            name: string;
            role: "user" | "admin" | "builder" | "none";
            segmentation: "interesting" | null;
            whiteListedProviders: ("openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks")[] | null;
            defaultEmbeddingProvider: "openai" | "mistral" | null;
            ssoEnforced?: boolean | undefined;
        }[] | {
            sId: string;
            id: number;
            name: string;
            role: "user" | "admin" | "builder" | "none";
            segmentation: "interesting" | null;
            whiteListedProviders: ("openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks")[] | null;
            defaultEmbeddingProvider: "openai" | "mistral" | null;
            blacklistedDomains: string[] | null;
            ssoEnforced?: boolean | undefined;
        }[];
    }>>;
    request(args: RequestArgsType): Promise<Result<{
        response: DustResponse;
        duration: number;
    }, {
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }>>;
    /**
     * This functions talks directly to the Dust production API to create a run.
     *
     * @param app DustAppType the app to run streamed
     * @param config DustAppConfigType the app config
     * @param inputs any[] the app inputs
     */
    runApp({ workspaceId, appId, appHash, appSpaceId, }: {
        workspaceId: string;
        appId: string;
        appSpaceId: string;
        appHash: string;
    }, config: DustAppConfigType, inputs: unknown[], { useWorkspaceCredentials }?: {
        useWorkspaceCredentials: boolean;
    }): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        status: {
            blocks: {
                status: "running" | "succeeded" | "errored";
                name: string;
                block_type: "map" | "reduce" | "code" | "data" | "input" | "data_source" | "llm" | "chat" | "while" | "end" | "search" | "curl" | "browser" | "database_schema" | "database";
                success_count: number;
                error_count: number;
            }[];
            run: "running" | "succeeded" | "errored";
        };
        config: {
            blocks: Record<string, any>;
        };
        run_id: string;
        created: number;
        run_type: "deploy" | "local" | "execute";
        traces: [["map" | "reduce" | "code" | "data" | "input" | "data_source" | "llm" | "chat" | "while" | "end" | "search" | "curl" | "browser" | "database_schema" | "database", string], {
            error: string | null;
            value?: unknown;
            meta?: unknown;
        }[][]][];
        specification_hash?: string | null | undefined;
        app_hash?: string | null | undefined;
        results?: {
            value?: unknown;
            error?: string | null | undefined;
        }[][] | null | undefined;
    }>>;
    /**
     * This functions talks directly to the Dust production API to create a streamed run.
     *
     * @param app DustAppType the app to run streamed
     * @param config DustAppConfigType the app config
     * @param inputs any[] the app inputs
     */
    runAppStreamed({ workspaceId, appId, appHash, appSpaceId, }: {
        workspaceId: string;
        appId: string;
        appSpaceId: string;
        appHash: string;
    }, config: DustAppConfigType, inputs: any[], { useWorkspaceCredentials }?: {
        useWorkspaceCredentials: boolean;
    }): Promise<Err<{
        type: string;
        message: string;
    }> | Ok<{
        eventStream: AsyncGenerator<{
            type: "error";
            content: {
                code: string;
                message: string;
            };
        } | {
            type: "run_status";
            content: {
                status: "running" | "succeeded" | "errored";
                run_id: string;
            };
        } | {
            type: "block_status";
            content: {
                status: "running" | "succeeded" | "errored";
                name: string;
                block_type: "map" | "reduce" | "code" | "data" | "input" | "data_source" | "llm" | "chat" | "while" | "end" | "search" | "curl" | "browser" | "database_schema" | "database";
                success_count: number;
                error_count: number;
            };
        } | {
            type: "block_execution";
            content: {
                block_type: "map" | "reduce" | "code" | "data" | "input" | "data_source" | "llm" | "chat" | "while" | "end" | "search" | "curl" | "browser" | "database_schema" | "database";
                block_name: string;
                execution: {
                    error: string | null;
                    value?: unknown;
                    meta?: unknown;
                }[][];
            };
        } | {
            type: "tokens";
            content: {
                map: {
                    name: string;
                    iteration: number;
                } | null;
                block_type: string;
                block_name: string;
                tokens: {
                    text: string;
                    tokens?: string[] | undefined;
                    logprobs?: number[] | undefined;
                };
                input_index: number;
            };
        } | {
            type: "function_call";
            content: {
                map: {
                    name: string;
                    iteration: number;
                } | null;
                block_type: string;
                block_name: string;
                input_index: number;
                function_call: {
                    name: string;
                };
            };
        } | {
            type: "function_call_arguments_tokens";
            content: {
                map: {
                    name: string;
                    iteration: number;
                } | null;
                block_type: string;
                block_name: string;
                tokens: {
                    text: string;
                };
                input_index: number;
            };
        } | {
            type: "final";
        }, void, unknown>;
        dustRunId: Promise<string>;
    }>>;
    /**
     * This actions talks to the Dust production API to retrieve the list of data sources of the
     * current workspace.
     */
    getDataSources(): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        sId: string;
        id: number;
        createdAt: number;
        name: string;
        description: string | null;
        assistantDefaultSelected: boolean;
        dustAPIProjectId: string;
        dustAPIDataSourceId: string;
        connectorId: string | null;
        connectorProvider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
        editedByUser?: {
            email: string | null;
            fullName: string | null;
            editedAt: number | null;
            imageUrl: string | null;
            userId: string | null;
        } | null | undefined;
    }[]>>;
    getAgentConfigurations({ view, includes, }: {
        view?: AgentConfigurationViewType;
        includes?: "authors"[];
    }): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        status: "active" | "archived" | "draft" | "disabled_by_admin" | "disabled_missing_datasource" | "disabled_free_workspace";
        sId: string;
        id: number;
        name: string;
        description: string;
        versionCreatedAt: string | null;
        version: number;
        versionAuthorId: number | null;
        instructions: string | null;
        model: {
            providerId: "openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks";
            modelId: "gpt-3.5-turbo" | "gpt-4-turbo" | "gpt-4o-2024-08-06" | "gpt-4o" | "gpt-4o-mini" | "gpt-4.1-2025-04-14" | "gpt-4.1-mini-2025-04-14" | "o1" | "o1-mini" | "o3-mini" | "claude-3-opus-20240229" | "claude-3-5-sonnet-20240620" | "claude-3-5-sonnet-20241022" | "claude-3-7-sonnet-20250219" | "claude-3-5-haiku-20241022" | "claude-3-haiku-20240307" | "claude-2.1" | "claude-instant-1.2" | "mistral-large-latest" | "mistral-medium" | "mistral-small-latest" | "codestral-latest" | "gemini-1.5-pro-latest" | "gemini-1.5-flash-latest" | "gemini-2.0-flash" | "gemini-2.0-flash-lite" | "gemini-2.5-pro-preview-03-25" | "gemini-2.0-flash-exp" | "gemini-2.0-flash-lite-preview-02-05" | "gemini-2.0-pro-exp-02-05" | "gemini-2.0-flash-thinking-exp-01-21" | "meta-llama/Llama-3.3-70B-Instruct-Turbo" | "Qwen/Qwen2.5-Coder-32B-Instruct" | "Qwen/QwQ-32B-Preview" | "Qwen/Qwen2-72B-Instruct" | "deepseek-ai/DeepSeek-V3" | "deepseek-ai/DeepSeek-R1" | "deepseek-chat" | "deepseek-reasoner" | "accounts/fireworks/models/deepseek-r1";
            temperature: number;
        };
        scope: "workspace" | "published" | "global" | "private";
        userFavorite: boolean;
        pictureUrl: string;
        maxStepsPerRun: number;
        visualizationEnabled: boolean;
        templateId: string | null;
        requestedGroupIds: string[][];
        lastAuthors?: readonly string[] | undefined;
        usage?: {
            messageCount: number;
            conversationCount: number;
            userCount: number;
            timePeriodSec: number;
        } | undefined;
        groupIds?: string[] | undefined;
    }[]>>;
    postContentFragment({ conversationId, contentFragment, }: {
        conversationId: string;
        contentFragment: PublicPostContentFragmentRequestBody;
    }): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        type: "content_fragment";
        sId: string;
        id: number;
        created: number;
        version: number;
        title: string;
        contentType: "application/vnd.dust.datasource" | "application/json" | "application/vnd.dust.confluence.space" | "application/vnd.dust.confluence.page" | "application/vnd.dust.github.repository" | "application/vnd.dust.github.code-root" | "application/vnd.dust.github.code-directory" | "application/vnd.dust.github.code-file" | "application/vnd.dust.github.issues" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussions" | "application/vnd.dust.github.discussion" | "application/vnd.dust.googledrive.shared-with-me" | "application/vnd.dust.googledrive.folder" | "application/vnd.dust.googledrive.spreadsheet" | "application/vnd.dust.intercom.collection" | "application/vnd.dust.intercom.teams-folder" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.team" | "application/vnd.dust.intercom.article" | "application/vnd.dust.intercom.help-center" | "application/vnd.dust.microsoft.folder" | "application/vnd.dust.microsoft.spreadsheet" | "application/vnd.dust.notion.page" | "application/vnd.dust.notion.unknown-folder" | "application/vnd.dust.notion.syncing-folder" | "application/vnd.dust.notion.database" | "application/vnd.dust.slack.channel" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.snowflake.database" | "application/vnd.dust.snowflake.schema" | "application/vnd.dust.snowflake.table" | "application/vnd.dust.webcrawler.folder" | "application/vnd.dust.zendesk.article" | "application/vnd.dust.zendesk.help-center" | "application/vnd.dust.zendesk.brand" | "application/vnd.dust.zendesk.category" | "application/vnd.dust.zendesk.tickets" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.bigquery.database" | "application/vnd.dust.bigquery.schema" | "application/vnd.dust.bigquery.table" | "application/vnd.dust.salesforce.database" | "application/vnd.dust.salesforce.schema" | "application/vnd.dust.salesforce.table" | "application/vnd.dust.gong.transcript" | "application/vnd.dust.gong.transcript-folder" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/vnd.google-apps.document" | "application/vnd.google-apps.presentation" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.google-apps.spreadsheet" | "application/vnd.ms-excel" | "application/pdf" | "application/vnd.dust.section.json" | "text/comma-separated-values" | "text/csv" | "text/markdown" | "text/plain" | "text/tab-separated-values" | "text/tsv" | "text/vnd.dust.attachment.slack.thread" | "text/html" | "text/xml" | "text/calendar" | "text/css" | "text/javascript" | "text/typescript" | "application/xml" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script" | "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "dust-application/slack";
        fileId: string | null;
        context: {
            username?: string | null | undefined;
            email?: string | null | undefined;
            fullName?: string | null | undefined;
            profilePictureUrl?: string | null | undefined;
        };
        visibility: "visible" | "deleted";
        sourceUrl: string | null;
        textUrl: string;
        textBytes: number | null;
        contentFragmentId: string;
        contentFragmentVersion: "latest" | "superseded";
        contentNodeData: {
            provider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
            nodeId: string;
            nodeDataSourceViewId: string;
            nodeType: "table" | "folder" | "document";
            spaceName: string;
        } | null;
    }>>;
    createConversation({ title, visibility, message, contentFragment, contentFragments, blocking, }: PublicPostConversationsRequestBody): Promise<Result<{
        message: {
            type: "user_message";
            sId: string;
            id: number;
            user: {
                sId: string;
                id: number;
                createdAt: number;
                provider: "github" | "auth0" | "google" | "okta" | "samlp" | "waad" | null;
                username: string;
                email: string;
                firstName: string;
                lastName: string | null;
                fullName: string;
                image: string | null;
            } | null;
            created: number;
            content: string;
            version: number;
            context: {
                username: string;
                timezone: string;
                email?: string | null | undefined;
                fullName?: string | null | undefined;
                profilePictureUrl?: string | null | undefined;
                origin?: "slack" | "zendesk" | "email" | "web" | "api" | "gsheet" | "zapier" | "n8n" | "make" | "raycast" | "github-copilot-chat" | "extension" | null | undefined;
                localMCPServerIds?: string[] | null | undefined;
            };
            visibility: "visible" | "deleted";
            mentions: {
                configurationId: string;
            }[];
        };
        conversation: {
            sId: string;
            id: number;
            created: number;
            content: ({
                type: "user_message";
                sId: string;
                id: number;
                user: {
                    sId: string;
                    id: number;
                    createdAt: number;
                    provider: "github" | "auth0" | "google" | "okta" | "samlp" | "waad" | null;
                    username: string;
                    email: string;
                    firstName: string;
                    lastName: string | null;
                    fullName: string;
                    image: string | null;
                } | null;
                created: number;
                content: string;
                version: number;
                context: {
                    username: string;
                    timezone: string;
                    email?: string | null | undefined;
                    fullName?: string | null | undefined;
                    profilePictureUrl?: string | null | undefined;
                    origin?: "slack" | "zendesk" | "email" | "web" | "api" | "gsheet" | "zapier" | "n8n" | "make" | "raycast" | "github-copilot-chat" | "extension" | null | undefined;
                    localMCPServerIds?: string[] | null | undefined;
                };
                visibility: "visible" | "deleted";
                mentions: {
                    configurationId: string;
                }[];
            }[] | {
                status: "created" | "succeeded" | "failed" | "cancelled";
                type: "agent_message";
                sId: string;
                id: number;
                error: {
                    code: string;
                    message: string;
                } | null;
                created: number;
                content: string | null;
                version: number;
                visibility: "visible" | "deleted";
                agentMessageId: number;
                parentMessageId: string | null;
                configuration: {
                    status: "active" | "archived" | "draft" | "disabled_by_admin" | "disabled_missing_datasource" | "disabled_free_workspace";
                    sId: string;
                    id: number;
                    name: string;
                    description: string;
                    versionCreatedAt: string | null;
                    version: number;
                    versionAuthorId: number | null;
                    instructions: string | null;
                    model: {
                        providerId: "openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks";
                        modelId: "gpt-3.5-turbo" | "gpt-4-turbo" | "gpt-4o-2024-08-06" | "gpt-4o" | "gpt-4o-mini" | "gpt-4.1-2025-04-14" | "gpt-4.1-mini-2025-04-14" | "o1" | "o1-mini" | "o3-mini" | "claude-3-opus-20240229" | "claude-3-5-sonnet-20240620" | "claude-3-5-sonnet-20241022" | "claude-3-7-sonnet-20250219" | "claude-3-5-haiku-20241022" | "claude-3-haiku-20240307" | "claude-2.1" | "claude-instant-1.2" | "mistral-large-latest" | "mistral-medium" | "mistral-small-latest" | "codestral-latest" | "gemini-1.5-pro-latest" | "gemini-1.5-flash-latest" | "gemini-2.0-flash" | "gemini-2.0-flash-lite" | "gemini-2.5-pro-preview-03-25" | "gemini-2.0-flash-exp" | "gemini-2.0-flash-lite-preview-02-05" | "gemini-2.0-pro-exp-02-05" | "gemini-2.0-flash-thinking-exp-01-21" | "meta-llama/Llama-3.3-70B-Instruct-Turbo" | "Qwen/Qwen2.5-Coder-32B-Instruct" | "Qwen/QwQ-32B-Preview" | "Qwen/Qwen2-72B-Instruct" | "deepseek-ai/DeepSeek-V3" | "deepseek-ai/DeepSeek-R1" | "deepseek-chat" | "deepseek-reasoner" | "accounts/fireworks/models/deepseek-r1";
                        temperature: number;
                    };
                    scope: "workspace" | "published" | "global" | "private";
                    userFavorite: boolean;
                    pictureUrl: string;
                    maxStepsPerRun: number;
                    visualizationEnabled: boolean;
                    templateId: string | null;
                    requestedGroupIds: string[][];
                    lastAuthors?: readonly string[] | undefined;
                    usage?: {
                        messageCount: number;
                        conversationCount: number;
                        userCount: number;
                        timePeriodSec: number;
                    } | undefined;
                    groupIds?: string[] | undefined;
                };
                actions: ({
                    params: {
                        relativeTimeFrame: {
                            duration: number;
                            unit: "hour" | "day" | "week" | "month" | "year";
                        } | null;
                        query: string | null;
                        topK: number;
                    };
                    type: "retrieval_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    documents: {
                        id: number;
                        sourceUrl: string | null;
                        chunks: {
                            text: string;
                            offset: number;
                            score: number | null;
                        }[];
                        score: number | null;
                        documentId: string;
                        dataSourceView: {
                            sId: string;
                            id: number;
                            createdAt: number;
                            category: "folder" | "actions" | "managed" | "website" | "apps";
                            dataSource: {
                                sId: string;
                                id: number;
                                createdAt: number;
                                name: string;
                                description: string | null;
                                assistantDefaultSelected: boolean;
                                dustAPIProjectId: string;
                                dustAPIDataSourceId: string;
                                connectorId: string | null;
                                connectorProvider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
                                editedByUser?: {
                                    email: string | null;
                                    fullName: string | null;
                                    editedAt: number | null;
                                    imageUrl: string | null;
                                    userId: string | null;
                                } | null | undefined;
                            };
                            kind: "custom" | "default";
                            parentsIn: string[] | null;
                            updatedAt: number;
                            spaceId: string;
                            editedByUser?: {
                                email: string | null;
                                fullName: string | null;
                                editedAt: number | null;
                                imageUrl: string | null;
                                userId: string | null;
                            } | null | undefined;
                        } | null;
                        reference: string;
                        tags: string[];
                        timestamp: number;
                    }[] | null;
                    step: number;
                } | {
                    output: unknown;
                    params: Record<string, string | number | boolean>;
                    type: "dust_app_run_action";
                    id: number;
                    appId: string;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    appWorkspaceId: string;
                    appName: string;
                    runningBlock: {
                        status: "running" | "succeeded" | "errored";
                        type: string;
                        name: string;
                    } | null;
                } | {
                    params: Record<string, string | number | boolean>;
                    type: "tables_query_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    output: Record<string, string | number | boolean> | null;
                    resultsFileId: string | null;
                    resultsFileSnippet: string | null;
                    sectionFileId: string | null;
                } | {
                    params: {
                        relativeTimeFrame: {
                            duration: number;
                            unit: "hour" | "day" | "week" | "month" | "year";
                        } | null;
                    };
                    type: "process_action";
                    schema: {
                        type: "string" | "number" | "boolean";
                        name: string;
                        description: string;
                    }[];
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    outputs: {
                        data: unknown[];
                        min_timestamp: number;
                        total_documents: number;
                        total_chunks: number;
                        total_tokens: number;
                    } | null;
                } | {
                    type: "websearch_action";
                    id: number;
                    agentMessageId: number;
                    query: string;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    output: {
                        results: {
                            link: string;
                            title: string;
                            reference: string;
                            snippet: string;
                        }[];
                    } | {
                        error: string;
                        results: {
                            link: string;
                            title: string;
                            reference: string;
                            snippet: string;
                        }[];
                    } | null;
                } | {
                    type: "browse_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    output: {
                        results: {
                            content: string;
                            requestedUrl: string;
                            browsedUrl: string;
                            responseCode: string;
                            errorMessage: string;
                        }[];
                    } | null;
                    urls: string[];
                } | {
                    type: "conversation_list_files_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    files: ({
                        title: string;
                        contentType: "application/vnd.dust.datasource" | "application/json" | "application/vnd.dust.confluence.space" | "application/vnd.dust.confluence.page" | "application/vnd.dust.github.repository" | "application/vnd.dust.github.code-root" | "application/vnd.dust.github.code-directory" | "application/vnd.dust.github.code-file" | "application/vnd.dust.github.issues" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussions" | "application/vnd.dust.github.discussion" | "application/vnd.dust.googledrive.shared-with-me" | "application/vnd.dust.googledrive.folder" | "application/vnd.dust.googledrive.spreadsheet" | "application/vnd.dust.intercom.collection" | "application/vnd.dust.intercom.teams-folder" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.team" | "application/vnd.dust.intercom.article" | "application/vnd.dust.intercom.help-center" | "application/vnd.dust.microsoft.folder" | "application/vnd.dust.microsoft.spreadsheet" | "application/vnd.dust.notion.page" | "application/vnd.dust.notion.unknown-folder" | "application/vnd.dust.notion.syncing-folder" | "application/vnd.dust.notion.database" | "application/vnd.dust.slack.channel" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.snowflake.database" | "application/vnd.dust.snowflake.schema" | "application/vnd.dust.snowflake.table" | "application/vnd.dust.webcrawler.folder" | "application/vnd.dust.zendesk.article" | "application/vnd.dust.zendesk.help-center" | "application/vnd.dust.zendesk.brand" | "application/vnd.dust.zendesk.category" | "application/vnd.dust.zendesk.tickets" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.bigquery.database" | "application/vnd.dust.bigquery.schema" | "application/vnd.dust.bigquery.table" | "application/vnd.dust.salesforce.database" | "application/vnd.dust.salesforce.schema" | "application/vnd.dust.salesforce.table" | "application/vnd.dust.gong.transcript" | "application/vnd.dust.gong.transcript-folder" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/vnd.google-apps.document" | "application/vnd.google-apps.presentation" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.google-apps.spreadsheet" | "application/vnd.ms-excel" | "application/pdf" | "application/vnd.dust.section.json" | "text/comma-separated-values" | "text/csv" | "text/markdown" | "text/plain" | "text/tab-separated-values" | "text/tsv" | "text/vnd.dust.attachment.slack.thread" | "text/html" | "text/xml" | "text/calendar" | "text/css" | "text/javascript" | "text/typescript" | "application/xml" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script" | "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "dust-application/slack";
                        fileId: string;
                        nodeDataSourceViewId?: undefined;
                        contentFragmentId?: undefined;
                    } | {
                        title: string;
                        contentType: "application/vnd.dust.datasource" | "application/json" | "application/vnd.dust.confluence.space" | "application/vnd.dust.confluence.page" | "application/vnd.dust.github.repository" | "application/vnd.dust.github.code-root" | "application/vnd.dust.github.code-directory" | "application/vnd.dust.github.code-file" | "application/vnd.dust.github.issues" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussions" | "application/vnd.dust.github.discussion" | "application/vnd.dust.googledrive.shared-with-me" | "application/vnd.dust.googledrive.folder" | "application/vnd.dust.googledrive.spreadsheet" | "application/vnd.dust.intercom.collection" | "application/vnd.dust.intercom.teams-folder" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.team" | "application/vnd.dust.intercom.article" | "application/vnd.dust.intercom.help-center" | "application/vnd.dust.microsoft.folder" | "application/vnd.dust.microsoft.spreadsheet" | "application/vnd.dust.notion.page" | "application/vnd.dust.notion.unknown-folder" | "application/vnd.dust.notion.syncing-folder" | "application/vnd.dust.notion.database" | "application/vnd.dust.slack.channel" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.snowflake.database" | "application/vnd.dust.snowflake.schema" | "application/vnd.dust.snowflake.table" | "application/vnd.dust.webcrawler.folder" | "application/vnd.dust.zendesk.article" | "application/vnd.dust.zendesk.help-center" | "application/vnd.dust.zendesk.brand" | "application/vnd.dust.zendesk.category" | "application/vnd.dust.zendesk.tickets" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.bigquery.database" | "application/vnd.dust.bigquery.schema" | "application/vnd.dust.bigquery.table" | "application/vnd.dust.salesforce.database" | "application/vnd.dust.salesforce.schema" | "application/vnd.dust.salesforce.table" | "application/vnd.dust.gong.transcript" | "application/vnd.dust.gong.transcript-folder" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/vnd.google-apps.document" | "application/vnd.google-apps.presentation" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.google-apps.spreadsheet" | "application/vnd.ms-excel" | "application/pdf" | "application/vnd.dust.section.json" | "text/comma-separated-values" | "text/csv" | "text/markdown" | "text/plain" | "text/tab-separated-values" | "text/tsv" | "text/vnd.dust.attachment.slack.thread" | "text/html" | "text/xml" | "text/calendar" | "text/css" | "text/javascript" | "text/typescript" | "application/xml" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script" | "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "dust-application/slack";
                        nodeDataSourceViewId: string;
                        contentFragmentId: string;
                        fileId?: undefined;
                    })[];
                } | {
                    params: {
                        fileId: string;
                    };
                    type: "conversation_include_file_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    tokensCount: number | null;
                    fileTitle: string | null;
                } | {
                    type: "reasoning_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    output: string | null;
                    thinking: string | null;
                } | {
                    type: "search_labels_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    output: {
                        tags: {
                            data_sources: string[];
                            tag: string;
                            match_count: number;
                        }[];
                    } | null;
                } | {
                    type: "tool_action";
                    id: number;
                    agentMessageId: number;
                    functionCallName: string | null;
                    params?: unknown;
                })[];
                chainOfThought: string | null;
                rawContents: {
                    content: string;
                    step: number;
                }[];
            }[] | {
                type: "content_fragment";
                sId: string;
                id: number;
                created: number;
                version: number;
                title: string;
                contentType: "application/vnd.dust.datasource" | "application/json" | "application/vnd.dust.confluence.space" | "application/vnd.dust.confluence.page" | "application/vnd.dust.github.repository" | "application/vnd.dust.github.code-root" | "application/vnd.dust.github.code-directory" | "application/vnd.dust.github.code-file" | "application/vnd.dust.github.issues" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussions" | "application/vnd.dust.github.discussion" | "application/vnd.dust.googledrive.shared-with-me" | "application/vnd.dust.googledrive.folder" | "application/vnd.dust.googledrive.spreadsheet" | "application/vnd.dust.intercom.collection" | "application/vnd.dust.intercom.teams-folder" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.team" | "application/vnd.dust.intercom.article" | "application/vnd.dust.intercom.help-center" | "application/vnd.dust.microsoft.folder" | "application/vnd.dust.microsoft.spreadsheet" | "application/vnd.dust.notion.page" | "application/vnd.dust.notion.unknown-folder" | "application/vnd.dust.notion.syncing-folder" | "application/vnd.dust.notion.database" | "application/vnd.dust.slack.channel" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.snowflake.database" | "application/vnd.dust.snowflake.schema" | "application/vnd.dust.snowflake.table" | "application/vnd.dust.webcrawler.folder" | "application/vnd.dust.zendesk.article" | "application/vnd.dust.zendesk.help-center" | "application/vnd.dust.zendesk.brand" | "application/vnd.dust.zendesk.category" | "application/vnd.dust.zendesk.tickets" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.bigquery.database" | "application/vnd.dust.bigquery.schema" | "application/vnd.dust.bigquery.table" | "application/vnd.dust.salesforce.database" | "application/vnd.dust.salesforce.schema" | "application/vnd.dust.salesforce.table" | "application/vnd.dust.gong.transcript" | "application/vnd.dust.gong.transcript-folder" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/vnd.google-apps.document" | "application/vnd.google-apps.presentation" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.google-apps.spreadsheet" | "application/vnd.ms-excel" | "application/pdf" | "application/vnd.dust.section.json" | "text/comma-separated-values" | "text/csv" | "text/markdown" | "text/plain" | "text/tab-separated-values" | "text/tsv" | "text/vnd.dust.attachment.slack.thread" | "text/html" | "text/xml" | "text/calendar" | "text/css" | "text/javascript" | "text/typescript" | "application/xml" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script" | "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "dust-application/slack";
                fileId: string | null;
                context: {
                    username?: string | null | undefined;
                    email?: string | null | undefined;
                    fullName?: string | null | undefined;
                    profilePictureUrl?: string | null | undefined;
                };
                visibility: "visible" | "deleted";
                sourceUrl: string | null;
                textUrl: string;
                textBytes: number | null;
                contentFragmentId: string;
                contentFragmentVersion: "latest" | "superseded";
                contentNodeData: {
                    provider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
                    nodeId: string;
                    nodeDataSourceViewId: string;
                    nodeType: "table" | "folder" | "document";
                    spaceName: string;
                } | null;
            }[])[];
            requestedGroupIds: string[][];
            title: string | null;
            visibility: "workspace" | "deleted" | "unlisted" | "test";
            owner: {
                sId: string;
                id: number;
                name: string;
                role: "user" | "admin" | "builder" | "none";
                segmentation: "interesting" | null;
                whiteListedProviders: ("openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks")[] | null;
                defaultEmbeddingProvider: "openai" | "mistral" | null;
                ssoEnforced?: boolean | undefined;
            };
            groupIds?: string[] | undefined;
            updated?: number | undefined;
        };
    }, {
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }>>;
    postUserMessage({ conversationId, message, }: {
        conversationId: string;
        message: PublicPostMessagesRequestBody;
    }): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        type: "user_message";
        sId: string;
        id: number;
        user: {
            sId: string;
            id: number;
            createdAt: number;
            provider: "github" | "auth0" | "google" | "okta" | "samlp" | "waad" | null;
            username: string;
            email: string;
            firstName: string;
            lastName: string | null;
            fullName: string;
            image: string | null;
        } | null;
        created: number;
        content: string;
        version: number;
        context: {
            username: string;
            timezone: string;
            email?: string | null | undefined;
            fullName?: string | null | undefined;
            profilePictureUrl?: string | null | undefined;
            origin?: "slack" | "zendesk" | "email" | "web" | "api" | "gsheet" | "zapier" | "n8n" | "make" | "raycast" | "github-copilot-chat" | "extension" | null | undefined;
            localMCPServerIds?: string[] | null | undefined;
        };
        visibility: "visible" | "deleted";
        mentions: {
            configurationId: string;
        }[];
    }>>;
    streamAgentAnswerEvents({ conversation, userMessageId, signal, }: {
        conversation: ConversationPublicType;
        userMessageId: string;
        signal?: AbortSignal;
    }): Promise<Err<Error> | Err<{
        type: string;
        message: string;
    }> | Ok<{
        eventStream: AsyncGenerator<{
            type: "error";
            content: {
                code: string;
                message: string;
            };
        } | {
            type: "user_message_error";
            error: {
                code: string;
                message: string;
            };
            created: number;
        } | {
            type: "agent_error";
            error: {
                code: string;
                message: string;
            };
            created: number;
            configurationId: string;
            messageId: string;
        } | {
            type: "agent_action_success";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                params: {
                    relativeTimeFrame: {
                        duration: number;
                        unit: "hour" | "day" | "week" | "month" | "year";
                    } | null;
                    query: string | null;
                    topK: number;
                };
                type: "retrieval_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                documents: {
                    id: number;
                    sourceUrl: string | null;
                    chunks: {
                        text: string;
                        offset: number;
                        score: number | null;
                    }[];
                    score: number | null;
                    documentId: string;
                    dataSourceView: {
                        sId: string;
                        id: number;
                        createdAt: number;
                        category: "folder" | "actions" | "managed" | "website" | "apps";
                        dataSource: {
                            sId: string;
                            id: number;
                            createdAt: number;
                            name: string;
                            description: string | null;
                            assistantDefaultSelected: boolean;
                            dustAPIProjectId: string;
                            dustAPIDataSourceId: string;
                            connectorId: string | null;
                            connectorProvider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
                            editedByUser?: {
                                email: string | null;
                                fullName: string | null;
                                editedAt: number | null;
                                imageUrl: string | null;
                                userId: string | null;
                            } | null | undefined;
                        };
                        kind: "custom" | "default";
                        parentsIn: string[] | null;
                        updatedAt: number;
                        spaceId: string;
                        editedByUser?: {
                            email: string | null;
                            fullName: string | null;
                            editedAt: number | null;
                            imageUrl: string | null;
                            userId: string | null;
                        } | null | undefined;
                    } | null;
                    reference: string;
                    tags: string[];
                    timestamp: number;
                }[] | null;
                step: number;
            } | {
                output: unknown;
                params: Record<string, string | number | boolean>;
                type: "dust_app_run_action";
                id: number;
                appId: string;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                appWorkspaceId: string;
                appName: string;
                runningBlock: {
                    status: "running" | "succeeded" | "errored";
                    type: string;
                    name: string;
                } | null;
            } | {
                params: Record<string, string | number | boolean>;
                type: "tables_query_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: Record<string, string | number | boolean> | null;
                resultsFileId: string | null;
                resultsFileSnippet: string | null;
                sectionFileId: string | null;
            } | {
                params: {
                    relativeTimeFrame: {
                        duration: number;
                        unit: "hour" | "day" | "week" | "month" | "year";
                    } | null;
                };
                type: "process_action";
                schema: {
                    type: "string" | "number" | "boolean";
                    name: string;
                    description: string;
                }[];
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                outputs: {
                    data: unknown[];
                    min_timestamp: number;
                    total_documents: number;
                    total_chunks: number;
                    total_tokens: number;
                } | null;
            } | {
                type: "websearch_action";
                id: number;
                agentMessageId: number;
                query: string;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: {
                    results: {
                        link: string;
                        title: string;
                        reference: string;
                        snippet: string;
                    }[];
                } | {
                    error: string;
                    results: {
                        link: string;
                        title: string;
                        reference: string;
                        snippet: string;
                    }[];
                } | null;
            } | {
                type: "browse_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: {
                    results: {
                        content: string;
                        requestedUrl: string;
                        browsedUrl: string;
                        responseCode: string;
                        errorMessage: string;
                    }[];
                } | null;
                urls: string[];
            } | {
                type: "conversation_list_files_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                files: ({
                    title: string;
                    contentType: "application/vnd.dust.datasource" | "application/json" | "application/vnd.dust.confluence.space" | "application/vnd.dust.confluence.page" | "application/vnd.dust.github.repository" | "application/vnd.dust.github.code-root" | "application/vnd.dust.github.code-directory" | "application/vnd.dust.github.code-file" | "application/vnd.dust.github.issues" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussions" | "application/vnd.dust.github.discussion" | "application/vnd.dust.googledrive.shared-with-me" | "application/vnd.dust.googledrive.folder" | "application/vnd.dust.googledrive.spreadsheet" | "application/vnd.dust.intercom.collection" | "application/vnd.dust.intercom.teams-folder" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.team" | "application/vnd.dust.intercom.article" | "application/vnd.dust.intercom.help-center" | "application/vnd.dust.microsoft.folder" | "application/vnd.dust.microsoft.spreadsheet" | "application/vnd.dust.notion.page" | "application/vnd.dust.notion.unknown-folder" | "application/vnd.dust.notion.syncing-folder" | "application/vnd.dust.notion.database" | "application/vnd.dust.slack.channel" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.snowflake.database" | "application/vnd.dust.snowflake.schema" | "application/vnd.dust.snowflake.table" | "application/vnd.dust.webcrawler.folder" | "application/vnd.dust.zendesk.article" | "application/vnd.dust.zendesk.help-center" | "application/vnd.dust.zendesk.brand" | "application/vnd.dust.zendesk.category" | "application/vnd.dust.zendesk.tickets" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.bigquery.database" | "application/vnd.dust.bigquery.schema" | "application/vnd.dust.bigquery.table" | "application/vnd.dust.salesforce.database" | "application/vnd.dust.salesforce.schema" | "application/vnd.dust.salesforce.table" | "application/vnd.dust.gong.transcript" | "application/vnd.dust.gong.transcript-folder" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/vnd.google-apps.document" | "application/vnd.google-apps.presentation" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.google-apps.spreadsheet" | "application/vnd.ms-excel" | "application/pdf" | "application/vnd.dust.section.json" | "text/comma-separated-values" | "text/csv" | "text/markdown" | "text/plain" | "text/tab-separated-values" | "text/tsv" | "text/vnd.dust.attachment.slack.thread" | "text/html" | "text/xml" | "text/calendar" | "text/css" | "text/javascript" | "text/typescript" | "application/xml" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script" | "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "dust-application/slack";
                    fileId: string;
                    nodeDataSourceViewId?: undefined;
                    contentFragmentId?: undefined;
                } | {
                    title: string;
                    contentType: "application/vnd.dust.datasource" | "application/json" | "application/vnd.dust.confluence.space" | "application/vnd.dust.confluence.page" | "application/vnd.dust.github.repository" | "application/vnd.dust.github.code-root" | "application/vnd.dust.github.code-directory" | "application/vnd.dust.github.code-file" | "application/vnd.dust.github.issues" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussions" | "application/vnd.dust.github.discussion" | "application/vnd.dust.googledrive.shared-with-me" | "application/vnd.dust.googledrive.folder" | "application/vnd.dust.googledrive.spreadsheet" | "application/vnd.dust.intercom.collection" | "application/vnd.dust.intercom.teams-folder" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.team" | "application/vnd.dust.intercom.article" | "application/vnd.dust.intercom.help-center" | "application/vnd.dust.microsoft.folder" | "application/vnd.dust.microsoft.spreadsheet" | "application/vnd.dust.notion.page" | "application/vnd.dust.notion.unknown-folder" | "application/vnd.dust.notion.syncing-folder" | "application/vnd.dust.notion.database" | "application/vnd.dust.slack.channel" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.snowflake.database" | "application/vnd.dust.snowflake.schema" | "application/vnd.dust.snowflake.table" | "application/vnd.dust.webcrawler.folder" | "application/vnd.dust.zendesk.article" | "application/vnd.dust.zendesk.help-center" | "application/vnd.dust.zendesk.brand" | "application/vnd.dust.zendesk.category" | "application/vnd.dust.zendesk.tickets" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.bigquery.database" | "application/vnd.dust.bigquery.schema" | "application/vnd.dust.bigquery.table" | "application/vnd.dust.salesforce.database" | "application/vnd.dust.salesforce.schema" | "application/vnd.dust.salesforce.table" | "application/vnd.dust.gong.transcript" | "application/vnd.dust.gong.transcript-folder" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/vnd.google-apps.document" | "application/vnd.google-apps.presentation" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.google-apps.spreadsheet" | "application/vnd.ms-excel" | "application/pdf" | "application/vnd.dust.section.json" | "text/comma-separated-values" | "text/csv" | "text/markdown" | "text/plain" | "text/tab-separated-values" | "text/tsv" | "text/vnd.dust.attachment.slack.thread" | "text/html" | "text/xml" | "text/calendar" | "text/css" | "text/javascript" | "text/typescript" | "application/xml" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script" | "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "dust-application/slack";
                    nodeDataSourceViewId: string;
                    contentFragmentId: string;
                    fileId?: undefined;
                })[];
            } | {
                params: {
                    fileId: string;
                };
                type: "conversation_include_file_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                tokensCount: number | null;
                fileTitle: string | null;
            } | {
                type: "reasoning_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: string | null;
                thinking: string | null;
            } | {
                type: "search_labels_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: {
                    tags: {
                        data_sources: string[];
                        tag: string;
                        match_count: number;
                    }[];
                } | null;
            } | {
                type: "tool_action";
                id: number;
                agentMessageId: number;
                functionCallName: string | null;
                params?: unknown;
            };
        } | {
            type: "generation_tokens";
            created: number;
            text: string;
            configurationId: string;
            messageId: string;
            classification: "tokens" | "chain_of_thought" | "opening_delimiter" | "closing_delimiter";
            delimiterClassification?: "tokens" | "chain_of_thought" | null | undefined;
        } | {
            message: {
                status: "created" | "succeeded" | "failed" | "cancelled";
                type: "agent_message";
                sId: string;
                id: number;
                error: {
                    code: string;
                    message: string;
                } | null;
                created: number;
                content: string | null;
                version: number;
                visibility: "visible" | "deleted";
                agentMessageId: number;
                parentMessageId: string | null;
                configuration: {
                    status: "active" | "archived" | "draft" | "disabled_by_admin" | "disabled_missing_datasource" | "disabled_free_workspace";
                    sId: string;
                    id: number;
                    name: string;
                    description: string;
                    versionCreatedAt: string | null;
                    version: number;
                    versionAuthorId: number | null;
                    instructions: string | null;
                    model: {
                        providerId: "openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks";
                        modelId: "gpt-3.5-turbo" | "gpt-4-turbo" | "gpt-4o-2024-08-06" | "gpt-4o" | "gpt-4o-mini" | "gpt-4.1-2025-04-14" | "gpt-4.1-mini-2025-04-14" | "o1" | "o1-mini" | "o3-mini" | "claude-3-opus-20240229" | "claude-3-5-sonnet-20240620" | "claude-3-5-sonnet-20241022" | "claude-3-7-sonnet-20250219" | "claude-3-5-haiku-20241022" | "claude-3-haiku-20240307" | "claude-2.1" | "claude-instant-1.2" | "mistral-large-latest" | "mistral-medium" | "mistral-small-latest" | "codestral-latest" | "gemini-1.5-pro-latest" | "gemini-1.5-flash-latest" | "gemini-2.0-flash" | "gemini-2.0-flash-lite" | "gemini-2.5-pro-preview-03-25" | "gemini-2.0-flash-exp" | "gemini-2.0-flash-lite-preview-02-05" | "gemini-2.0-pro-exp-02-05" | "gemini-2.0-flash-thinking-exp-01-21" | "meta-llama/Llama-3.3-70B-Instruct-Turbo" | "Qwen/Qwen2.5-Coder-32B-Instruct" | "Qwen/QwQ-32B-Preview" | "Qwen/Qwen2-72B-Instruct" | "deepseek-ai/DeepSeek-V3" | "deepseek-ai/DeepSeek-R1" | "deepseek-chat" | "deepseek-reasoner" | "accounts/fireworks/models/deepseek-r1";
                        temperature: number;
                    };
                    scope: "workspace" | "published" | "global" | "private";
                    userFavorite: boolean;
                    pictureUrl: string;
                    maxStepsPerRun: number;
                    visualizationEnabled: boolean;
                    templateId: string | null;
                    requestedGroupIds: string[][];
                    lastAuthors?: readonly string[] | undefined;
                    usage?: {
                        messageCount: number;
                        conversationCount: number;
                        userCount: number;
                        timePeriodSec: number;
                    } | undefined;
                    groupIds?: string[] | undefined;
                };
                actions: ({
                    params: {
                        relativeTimeFrame: {
                            duration: number;
                            unit: "hour" | "day" | "week" | "month" | "year";
                        } | null;
                        query: string | null;
                        topK: number;
                    };
                    type: "retrieval_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    documents: {
                        id: number;
                        sourceUrl: string | null;
                        chunks: {
                            text: string;
                            offset: number;
                            score: number | null;
                        }[];
                        score: number | null;
                        documentId: string;
                        dataSourceView: {
                            sId: string;
                            id: number;
                            createdAt: number;
                            category: "folder" | "actions" | "managed" | "website" | "apps";
                            dataSource: {
                                sId: string;
                                id: number;
                                createdAt: number;
                                name: string;
                                description: string | null;
                                assistantDefaultSelected: boolean;
                                dustAPIProjectId: string;
                                dustAPIDataSourceId: string;
                                connectorId: string | null;
                                connectorProvider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
                                editedByUser?: {
                                    email: string | null;
                                    fullName: string | null;
                                    editedAt: number | null;
                                    imageUrl: string | null;
                                    userId: string | null;
                                } | null | undefined;
                            };
                            kind: "custom" | "default";
                            parentsIn: string[] | null;
                            updatedAt: number;
                            spaceId: string;
                            editedByUser?: {
                                email: string | null;
                                fullName: string | null;
                                editedAt: number | null;
                                imageUrl: string | null;
                                userId: string | null;
                            } | null | undefined;
                        } | null;
                        reference: string;
                        tags: string[];
                        timestamp: number;
                    }[] | null;
                    step: number;
                } | {
                    output: unknown;
                    params: Record<string, string | number | boolean>;
                    type: "dust_app_run_action";
                    id: number;
                    appId: string;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    appWorkspaceId: string;
                    appName: string;
                    runningBlock: {
                        status: "running" | "succeeded" | "errored";
                        type: string;
                        name: string;
                    } | null;
                } | {
                    params: Record<string, string | number | boolean>;
                    type: "tables_query_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    output: Record<string, string | number | boolean> | null;
                    resultsFileId: string | null;
                    resultsFileSnippet: string | null;
                    sectionFileId: string | null;
                } | {
                    params: {
                        relativeTimeFrame: {
                            duration: number;
                            unit: "hour" | "day" | "week" | "month" | "year";
                        } | null;
                    };
                    type: "process_action";
                    schema: {
                        type: "string" | "number" | "boolean";
                        name: string;
                        description: string;
                    }[];
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    outputs: {
                        data: unknown[];
                        min_timestamp: number;
                        total_documents: number;
                        total_chunks: number;
                        total_tokens: number;
                    } | null;
                } | {
                    type: "websearch_action";
                    id: number;
                    agentMessageId: number;
                    query: string;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    output: {
                        results: {
                            link: string;
                            title: string;
                            reference: string;
                            snippet: string;
                        }[];
                    } | {
                        error: string;
                        results: {
                            link: string;
                            title: string;
                            reference: string;
                            snippet: string;
                        }[];
                    } | null;
                } | {
                    type: "browse_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    output: {
                        results: {
                            content: string;
                            requestedUrl: string;
                            browsedUrl: string;
                            responseCode: string;
                            errorMessage: string;
                        }[];
                    } | null;
                    urls: string[];
                } | {
                    type: "conversation_list_files_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    files: ({
                        title: string;
                        contentType: "application/vnd.dust.datasource" | "application/json" | "application/vnd.dust.confluence.space" | "application/vnd.dust.confluence.page" | "application/vnd.dust.github.repository" | "application/vnd.dust.github.code-root" | "application/vnd.dust.github.code-directory" | "application/vnd.dust.github.code-file" | "application/vnd.dust.github.issues" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussions" | "application/vnd.dust.github.discussion" | "application/vnd.dust.googledrive.shared-with-me" | "application/vnd.dust.googledrive.folder" | "application/vnd.dust.googledrive.spreadsheet" | "application/vnd.dust.intercom.collection" | "application/vnd.dust.intercom.teams-folder" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.team" | "application/vnd.dust.intercom.article" | "application/vnd.dust.intercom.help-center" | "application/vnd.dust.microsoft.folder" | "application/vnd.dust.microsoft.spreadsheet" | "application/vnd.dust.notion.page" | "application/vnd.dust.notion.unknown-folder" | "application/vnd.dust.notion.syncing-folder" | "application/vnd.dust.notion.database" | "application/vnd.dust.slack.channel" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.snowflake.database" | "application/vnd.dust.snowflake.schema" | "application/vnd.dust.snowflake.table" | "application/vnd.dust.webcrawler.folder" | "application/vnd.dust.zendesk.article" | "application/vnd.dust.zendesk.help-center" | "application/vnd.dust.zendesk.brand" | "application/vnd.dust.zendesk.category" | "application/vnd.dust.zendesk.tickets" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.bigquery.database" | "application/vnd.dust.bigquery.schema" | "application/vnd.dust.bigquery.table" | "application/vnd.dust.salesforce.database" | "application/vnd.dust.salesforce.schema" | "application/vnd.dust.salesforce.table" | "application/vnd.dust.gong.transcript" | "application/vnd.dust.gong.transcript-folder" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/vnd.google-apps.document" | "application/vnd.google-apps.presentation" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.google-apps.spreadsheet" | "application/vnd.ms-excel" | "application/pdf" | "application/vnd.dust.section.json" | "text/comma-separated-values" | "text/csv" | "text/markdown" | "text/plain" | "text/tab-separated-values" | "text/tsv" | "text/vnd.dust.attachment.slack.thread" | "text/html" | "text/xml" | "text/calendar" | "text/css" | "text/javascript" | "text/typescript" | "application/xml" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script" | "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "dust-application/slack";
                        fileId: string;
                        nodeDataSourceViewId?: undefined;
                        contentFragmentId?: undefined;
                    } | {
                        title: string;
                        contentType: "application/vnd.dust.datasource" | "application/json" | "application/vnd.dust.confluence.space" | "application/vnd.dust.confluence.page" | "application/vnd.dust.github.repository" | "application/vnd.dust.github.code-root" | "application/vnd.dust.github.code-directory" | "application/vnd.dust.github.code-file" | "application/vnd.dust.github.issues" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussions" | "application/vnd.dust.github.discussion" | "application/vnd.dust.googledrive.shared-with-me" | "application/vnd.dust.googledrive.folder" | "application/vnd.dust.googledrive.spreadsheet" | "application/vnd.dust.intercom.collection" | "application/vnd.dust.intercom.teams-folder" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.team" | "application/vnd.dust.intercom.article" | "application/vnd.dust.intercom.help-center" | "application/vnd.dust.microsoft.folder" | "application/vnd.dust.microsoft.spreadsheet" | "application/vnd.dust.notion.page" | "application/vnd.dust.notion.unknown-folder" | "application/vnd.dust.notion.syncing-folder" | "application/vnd.dust.notion.database" | "application/vnd.dust.slack.channel" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.snowflake.database" | "application/vnd.dust.snowflake.schema" | "application/vnd.dust.snowflake.table" | "application/vnd.dust.webcrawler.folder" | "application/vnd.dust.zendesk.article" | "application/vnd.dust.zendesk.help-center" | "application/vnd.dust.zendesk.brand" | "application/vnd.dust.zendesk.category" | "application/vnd.dust.zendesk.tickets" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.bigquery.database" | "application/vnd.dust.bigquery.schema" | "application/vnd.dust.bigquery.table" | "application/vnd.dust.salesforce.database" | "application/vnd.dust.salesforce.schema" | "application/vnd.dust.salesforce.table" | "application/vnd.dust.gong.transcript" | "application/vnd.dust.gong.transcript-folder" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/vnd.google-apps.document" | "application/vnd.google-apps.presentation" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.google-apps.spreadsheet" | "application/vnd.ms-excel" | "application/pdf" | "application/vnd.dust.section.json" | "text/comma-separated-values" | "text/csv" | "text/markdown" | "text/plain" | "text/tab-separated-values" | "text/tsv" | "text/vnd.dust.attachment.slack.thread" | "text/html" | "text/xml" | "text/calendar" | "text/css" | "text/javascript" | "text/typescript" | "application/xml" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script" | "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "dust-application/slack";
                        nodeDataSourceViewId: string;
                        contentFragmentId: string;
                        fileId?: undefined;
                    })[];
                } | {
                    params: {
                        fileId: string;
                    };
                    type: "conversation_include_file_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    tokensCount: number | null;
                    fileTitle: string | null;
                } | {
                    type: "reasoning_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    output: string | null;
                    thinking: string | null;
                } | {
                    type: "search_labels_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    output: {
                        tags: {
                            data_sources: string[];
                            tag: string;
                            match_count: number;
                        }[];
                    } | null;
                } | {
                    type: "tool_action";
                    id: number;
                    agentMessageId: number;
                    functionCallName: string | null;
                    params?: unknown;
                })[];
                chainOfThought: string | null;
                rawContents: {
                    content: string;
                    step: number;
                }[];
            };
            type: "agent_message_success";
            created: number;
            configurationId: string;
            messageId: string;
            runIds: string[];
        } | {
            type: "browse_params";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                type: "browse_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: {
                    results: {
                        content: string;
                        requestedUrl: string;
                        browsedUrl: string;
                        responseCode: string;
                        errorMessage: string;
                    }[];
                } | null;
                urls: string[];
            };
        } | {
            type: "conversation_include_file_params";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                params: {
                    fileId: string;
                };
                type: "conversation_include_file_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                tokensCount: number | null;
                fileTitle: string | null;
            };
        } | {
            type: "dust_app_run_block";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                output: unknown;
                params: Record<string, string | number | boolean>;
                type: "dust_app_run_action";
                id: number;
                appId: string;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                appWorkspaceId: string;
                appName: string;
                runningBlock: {
                    status: "running" | "succeeded" | "errored";
                    type: string;
                    name: string;
                } | null;
            };
        } | {
            type: "dust_app_run_params";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                output: unknown;
                params: Record<string, string | number | boolean>;
                type: "dust_app_run_action";
                id: number;
                appId: string;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                appWorkspaceId: string;
                appName: string;
                runningBlock: {
                    status: "running" | "succeeded" | "errored";
                    type: string;
                    name: string;
                } | null;
            };
        } | {
            type: "process_params";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                params: {
                    relativeTimeFrame: {
                        duration: number;
                        unit: "hour" | "day" | "week" | "month" | "year";
                    } | null;
                };
                type: "process_action";
                schema: {
                    type: "string" | "number" | "boolean";
                    name: string;
                    description: string;
                }[];
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                outputs: {
                    data: unknown[];
                    min_timestamp: number;
                    total_documents: number;
                    total_chunks: number;
                    total_tokens: number;
                } | null;
            };
            dataSources: {
                filter: {
                    parents: {
                        in: string[];
                        not: string[];
                    } | null;
                };
                workspaceId: string;
                dataSourceViewId: string;
            }[];
        } | {
            type: "reasoning_started";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                type: "reasoning_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: string | null;
                thinking: string | null;
            };
        } | {
            type: "reasoning_thinking";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                type: "reasoning_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: string | null;
                thinking: string | null;
            };
        } | {
            type: "reasoning_tokens";
            created: number;
            content: string;
            configurationId: string;
            messageId: string;
            action: {
                type: "reasoning_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: string | null;
                thinking: string | null;
            };
            classification: "tokens" | "chain_of_thought";
        } | {
            type: "retrieval_params";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                params: {
                    relativeTimeFrame: {
                        duration: number;
                        unit: "hour" | "day" | "week" | "month" | "year";
                    } | null;
                    query: string | null;
                    topK: number;
                };
                type: "retrieval_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                documents: {
                    id: number;
                    sourceUrl: string | null;
                    chunks: {
                        text: string;
                        offset: number;
                        score: number | null;
                    }[];
                    score: number | null;
                    documentId: string;
                    dataSourceView: {
                        sId: string;
                        id: number;
                        createdAt: number;
                        category: "folder" | "actions" | "managed" | "website" | "apps";
                        dataSource: {
                            sId: string;
                            id: number;
                            createdAt: number;
                            name: string;
                            description: string | null;
                            assistantDefaultSelected: boolean;
                            dustAPIProjectId: string;
                            dustAPIDataSourceId: string;
                            connectorId: string | null;
                            connectorProvider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
                            editedByUser?: {
                                email: string | null;
                                fullName: string | null;
                                editedAt: number | null;
                                imageUrl: string | null;
                                userId: string | null;
                            } | null | undefined;
                        };
                        kind: "custom" | "default";
                        parentsIn: string[] | null;
                        updatedAt: number;
                        spaceId: string;
                        editedByUser?: {
                            email: string | null;
                            fullName: string | null;
                            editedAt: number | null;
                            imageUrl: string | null;
                            userId: string | null;
                        } | null | undefined;
                    } | null;
                    reference: string;
                    tags: string[];
                    timestamp: number;
                }[] | null;
                step: number;
            };
            dataSources: {
                filter: {
                    parents: {
                        in: string[];
                        not: string[];
                    } | null;
                };
                workspaceId: string;
                dataSourceViewId: string;
            }[];
        } | {
            type: "search_labels_params";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                type: "search_labels_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: {
                    tags: {
                        data_sources: string[];
                        tag: string;
                        match_count: number;
                    }[];
                } | null;
            };
        } | {
            type: "tables_query_model_output";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                params: Record<string, string | number | boolean>;
                type: "tables_query_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: Record<string, string | number | boolean> | null;
                resultsFileId: string | null;
                resultsFileSnippet: string | null;
                sectionFileId: string | null;
            };
        } | {
            type: "tables_query_output";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                params: Record<string, string | number | boolean>;
                type: "tables_query_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: Record<string, string | number | boolean> | null;
                resultsFileId: string | null;
                resultsFileSnippet: string | null;
                sectionFileId: string | null;
            };
        } | {
            type: "tables_query_started";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                params: Record<string, string | number | boolean>;
                type: "tables_query_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: Record<string, string | number | boolean> | null;
                resultsFileId: string | null;
                resultsFileSnippet: string | null;
                sectionFileId: string | null;
            };
        } | {
            type: "websearch_params";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                type: "websearch_action";
                id: number;
                agentMessageId: number;
                query: string;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: {
                    results: {
                        link: string;
                        title: string;
                        reference: string;
                        snippet: string;
                    }[];
                } | {
                    error: string;
                    results: {
                        link: string;
                        title: string;
                        reference: string;
                        snippet: string;
                    }[];
                } | null;
            };
        } | {
            type: "tool_params";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                type: "tool_action";
                id: number;
                agentMessageId: number;
                functionCallName: string | null;
                params?: unknown;
            };
        } | {
            type: "tool_approve_execution";
            inputs: Record<string, any>;
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                type: "tool_action";
                id: number;
                agentMessageId: number;
                functionCallName: string | null;
                params?: unknown;
            };
            metadata: {
                mcpServerName: string;
                toolName: string;
                agentName: string;
            };
            stake?: "low" | "high" | undefined;
        }, void, unknown>;
    }>>;
    streamAgentMessageEvents({ conversation, agentMessage, signal, }: {
        conversation: ConversationPublicType;
        agentMessage: AgentMessagePublicType;
        signal?: AbortSignal;
    }): Promise<Err<{
        type: string;
        message: string;
    }> | Ok<{
        eventStream: AsyncGenerator<{
            type: "error";
            content: {
                code: string;
                message: string;
            };
        } | {
            type: "user_message_error";
            error: {
                code: string;
                message: string;
            };
            created: number;
        } | {
            type: "agent_error";
            error: {
                code: string;
                message: string;
            };
            created: number;
            configurationId: string;
            messageId: string;
        } | {
            type: "agent_action_success";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                params: {
                    relativeTimeFrame: {
                        duration: number;
                        unit: "hour" | "day" | "week" | "month" | "year";
                    } | null;
                    query: string | null;
                    topK: number;
                };
                type: "retrieval_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                documents: {
                    id: number;
                    sourceUrl: string | null;
                    chunks: {
                        text: string;
                        offset: number;
                        score: number | null;
                    }[];
                    score: number | null;
                    documentId: string;
                    dataSourceView: {
                        sId: string;
                        id: number;
                        createdAt: number;
                        category: "folder" | "actions" | "managed" | "website" | "apps";
                        dataSource: {
                            sId: string;
                            id: number;
                            createdAt: number;
                            name: string;
                            description: string | null;
                            assistantDefaultSelected: boolean;
                            dustAPIProjectId: string;
                            dustAPIDataSourceId: string;
                            connectorId: string | null;
                            connectorProvider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
                            editedByUser?: {
                                email: string | null;
                                fullName: string | null;
                                editedAt: number | null;
                                imageUrl: string | null;
                                userId: string | null;
                            } | null | undefined;
                        };
                        kind: "custom" | "default";
                        parentsIn: string[] | null;
                        updatedAt: number;
                        spaceId: string;
                        editedByUser?: {
                            email: string | null;
                            fullName: string | null;
                            editedAt: number | null;
                            imageUrl: string | null;
                            userId: string | null;
                        } | null | undefined;
                    } | null;
                    reference: string;
                    tags: string[];
                    timestamp: number;
                }[] | null;
                step: number;
            } | {
                output: unknown;
                params: Record<string, string | number | boolean>;
                type: "dust_app_run_action";
                id: number;
                appId: string;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                appWorkspaceId: string;
                appName: string;
                runningBlock: {
                    status: "running" | "succeeded" | "errored";
                    type: string;
                    name: string;
                } | null;
            } | {
                params: Record<string, string | number | boolean>;
                type: "tables_query_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: Record<string, string | number | boolean> | null;
                resultsFileId: string | null;
                resultsFileSnippet: string | null;
                sectionFileId: string | null;
            } | {
                params: {
                    relativeTimeFrame: {
                        duration: number;
                        unit: "hour" | "day" | "week" | "month" | "year";
                    } | null;
                };
                type: "process_action";
                schema: {
                    type: "string" | "number" | "boolean";
                    name: string;
                    description: string;
                }[];
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                outputs: {
                    data: unknown[];
                    min_timestamp: number;
                    total_documents: number;
                    total_chunks: number;
                    total_tokens: number;
                } | null;
            } | {
                type: "websearch_action";
                id: number;
                agentMessageId: number;
                query: string;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: {
                    results: {
                        link: string;
                        title: string;
                        reference: string;
                        snippet: string;
                    }[];
                } | {
                    error: string;
                    results: {
                        link: string;
                        title: string;
                        reference: string;
                        snippet: string;
                    }[];
                } | null;
            } | {
                type: "browse_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: {
                    results: {
                        content: string;
                        requestedUrl: string;
                        browsedUrl: string;
                        responseCode: string;
                        errorMessage: string;
                    }[];
                } | null;
                urls: string[];
            } | {
                type: "conversation_list_files_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                files: ({
                    title: string;
                    contentType: "application/vnd.dust.datasource" | "application/json" | "application/vnd.dust.confluence.space" | "application/vnd.dust.confluence.page" | "application/vnd.dust.github.repository" | "application/vnd.dust.github.code-root" | "application/vnd.dust.github.code-directory" | "application/vnd.dust.github.code-file" | "application/vnd.dust.github.issues" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussions" | "application/vnd.dust.github.discussion" | "application/vnd.dust.googledrive.shared-with-me" | "application/vnd.dust.googledrive.folder" | "application/vnd.dust.googledrive.spreadsheet" | "application/vnd.dust.intercom.collection" | "application/vnd.dust.intercom.teams-folder" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.team" | "application/vnd.dust.intercom.article" | "application/vnd.dust.intercom.help-center" | "application/vnd.dust.microsoft.folder" | "application/vnd.dust.microsoft.spreadsheet" | "application/vnd.dust.notion.page" | "application/vnd.dust.notion.unknown-folder" | "application/vnd.dust.notion.syncing-folder" | "application/vnd.dust.notion.database" | "application/vnd.dust.slack.channel" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.snowflake.database" | "application/vnd.dust.snowflake.schema" | "application/vnd.dust.snowflake.table" | "application/vnd.dust.webcrawler.folder" | "application/vnd.dust.zendesk.article" | "application/vnd.dust.zendesk.help-center" | "application/vnd.dust.zendesk.brand" | "application/vnd.dust.zendesk.category" | "application/vnd.dust.zendesk.tickets" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.bigquery.database" | "application/vnd.dust.bigquery.schema" | "application/vnd.dust.bigquery.table" | "application/vnd.dust.salesforce.database" | "application/vnd.dust.salesforce.schema" | "application/vnd.dust.salesforce.table" | "application/vnd.dust.gong.transcript" | "application/vnd.dust.gong.transcript-folder" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/vnd.google-apps.document" | "application/vnd.google-apps.presentation" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.google-apps.spreadsheet" | "application/vnd.ms-excel" | "application/pdf" | "application/vnd.dust.section.json" | "text/comma-separated-values" | "text/csv" | "text/markdown" | "text/plain" | "text/tab-separated-values" | "text/tsv" | "text/vnd.dust.attachment.slack.thread" | "text/html" | "text/xml" | "text/calendar" | "text/css" | "text/javascript" | "text/typescript" | "application/xml" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script" | "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "dust-application/slack";
                    fileId: string;
                    nodeDataSourceViewId?: undefined;
                    contentFragmentId?: undefined;
                } | {
                    title: string;
                    contentType: "application/vnd.dust.datasource" | "application/json" | "application/vnd.dust.confluence.space" | "application/vnd.dust.confluence.page" | "application/vnd.dust.github.repository" | "application/vnd.dust.github.code-root" | "application/vnd.dust.github.code-directory" | "application/vnd.dust.github.code-file" | "application/vnd.dust.github.issues" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussions" | "application/vnd.dust.github.discussion" | "application/vnd.dust.googledrive.shared-with-me" | "application/vnd.dust.googledrive.folder" | "application/vnd.dust.googledrive.spreadsheet" | "application/vnd.dust.intercom.collection" | "application/vnd.dust.intercom.teams-folder" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.team" | "application/vnd.dust.intercom.article" | "application/vnd.dust.intercom.help-center" | "application/vnd.dust.microsoft.folder" | "application/vnd.dust.microsoft.spreadsheet" | "application/vnd.dust.notion.page" | "application/vnd.dust.notion.unknown-folder" | "application/vnd.dust.notion.syncing-folder" | "application/vnd.dust.notion.database" | "application/vnd.dust.slack.channel" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.snowflake.database" | "application/vnd.dust.snowflake.schema" | "application/vnd.dust.snowflake.table" | "application/vnd.dust.webcrawler.folder" | "application/vnd.dust.zendesk.article" | "application/vnd.dust.zendesk.help-center" | "application/vnd.dust.zendesk.brand" | "application/vnd.dust.zendesk.category" | "application/vnd.dust.zendesk.tickets" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.bigquery.database" | "application/vnd.dust.bigquery.schema" | "application/vnd.dust.bigquery.table" | "application/vnd.dust.salesforce.database" | "application/vnd.dust.salesforce.schema" | "application/vnd.dust.salesforce.table" | "application/vnd.dust.gong.transcript" | "application/vnd.dust.gong.transcript-folder" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/vnd.google-apps.document" | "application/vnd.google-apps.presentation" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.google-apps.spreadsheet" | "application/vnd.ms-excel" | "application/pdf" | "application/vnd.dust.section.json" | "text/comma-separated-values" | "text/csv" | "text/markdown" | "text/plain" | "text/tab-separated-values" | "text/tsv" | "text/vnd.dust.attachment.slack.thread" | "text/html" | "text/xml" | "text/calendar" | "text/css" | "text/javascript" | "text/typescript" | "application/xml" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script" | "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "dust-application/slack";
                    nodeDataSourceViewId: string;
                    contentFragmentId: string;
                    fileId?: undefined;
                })[];
            } | {
                params: {
                    fileId: string;
                };
                type: "conversation_include_file_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                tokensCount: number | null;
                fileTitle: string | null;
            } | {
                type: "reasoning_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: string | null;
                thinking: string | null;
            } | {
                type: "search_labels_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: {
                    tags: {
                        data_sources: string[];
                        tag: string;
                        match_count: number;
                    }[];
                } | null;
            } | {
                type: "tool_action";
                id: number;
                agentMessageId: number;
                functionCallName: string | null;
                params?: unknown;
            };
        } | {
            type: "generation_tokens";
            created: number;
            text: string;
            configurationId: string;
            messageId: string;
            classification: "tokens" | "chain_of_thought" | "opening_delimiter" | "closing_delimiter";
            delimiterClassification?: "tokens" | "chain_of_thought" | null | undefined;
        } | {
            message: {
                status: "created" | "succeeded" | "failed" | "cancelled";
                type: "agent_message";
                sId: string;
                id: number;
                error: {
                    code: string;
                    message: string;
                } | null;
                created: number;
                content: string | null;
                version: number;
                visibility: "visible" | "deleted";
                agentMessageId: number;
                parentMessageId: string | null;
                configuration: {
                    status: "active" | "archived" | "draft" | "disabled_by_admin" | "disabled_missing_datasource" | "disabled_free_workspace";
                    sId: string;
                    id: number;
                    name: string;
                    description: string;
                    versionCreatedAt: string | null;
                    version: number;
                    versionAuthorId: number | null;
                    instructions: string | null;
                    model: {
                        providerId: "openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks";
                        modelId: "gpt-3.5-turbo" | "gpt-4-turbo" | "gpt-4o-2024-08-06" | "gpt-4o" | "gpt-4o-mini" | "gpt-4.1-2025-04-14" | "gpt-4.1-mini-2025-04-14" | "o1" | "o1-mini" | "o3-mini" | "claude-3-opus-20240229" | "claude-3-5-sonnet-20240620" | "claude-3-5-sonnet-20241022" | "claude-3-7-sonnet-20250219" | "claude-3-5-haiku-20241022" | "claude-3-haiku-20240307" | "claude-2.1" | "claude-instant-1.2" | "mistral-large-latest" | "mistral-medium" | "mistral-small-latest" | "codestral-latest" | "gemini-1.5-pro-latest" | "gemini-1.5-flash-latest" | "gemini-2.0-flash" | "gemini-2.0-flash-lite" | "gemini-2.5-pro-preview-03-25" | "gemini-2.0-flash-exp" | "gemini-2.0-flash-lite-preview-02-05" | "gemini-2.0-pro-exp-02-05" | "gemini-2.0-flash-thinking-exp-01-21" | "meta-llama/Llama-3.3-70B-Instruct-Turbo" | "Qwen/Qwen2.5-Coder-32B-Instruct" | "Qwen/QwQ-32B-Preview" | "Qwen/Qwen2-72B-Instruct" | "deepseek-ai/DeepSeek-V3" | "deepseek-ai/DeepSeek-R1" | "deepseek-chat" | "deepseek-reasoner" | "accounts/fireworks/models/deepseek-r1";
                        temperature: number;
                    };
                    scope: "workspace" | "published" | "global" | "private";
                    userFavorite: boolean;
                    pictureUrl: string;
                    maxStepsPerRun: number;
                    visualizationEnabled: boolean;
                    templateId: string | null;
                    requestedGroupIds: string[][];
                    lastAuthors?: readonly string[] | undefined;
                    usage?: {
                        messageCount: number;
                        conversationCount: number;
                        userCount: number;
                        timePeriodSec: number;
                    } | undefined;
                    groupIds?: string[] | undefined;
                };
                actions: ({
                    params: {
                        relativeTimeFrame: {
                            duration: number;
                            unit: "hour" | "day" | "week" | "month" | "year";
                        } | null;
                        query: string | null;
                        topK: number;
                    };
                    type: "retrieval_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    documents: {
                        id: number;
                        sourceUrl: string | null;
                        chunks: {
                            text: string;
                            offset: number;
                            score: number | null;
                        }[];
                        score: number | null;
                        documentId: string;
                        dataSourceView: {
                            sId: string;
                            id: number;
                            createdAt: number;
                            category: "folder" | "actions" | "managed" | "website" | "apps";
                            dataSource: {
                                sId: string;
                                id: number;
                                createdAt: number;
                                name: string;
                                description: string | null;
                                assistantDefaultSelected: boolean;
                                dustAPIProjectId: string;
                                dustAPIDataSourceId: string;
                                connectorId: string | null;
                                connectorProvider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
                                editedByUser?: {
                                    email: string | null;
                                    fullName: string | null;
                                    editedAt: number | null;
                                    imageUrl: string | null;
                                    userId: string | null;
                                } | null | undefined;
                            };
                            kind: "custom" | "default";
                            parentsIn: string[] | null;
                            updatedAt: number;
                            spaceId: string;
                            editedByUser?: {
                                email: string | null;
                                fullName: string | null;
                                editedAt: number | null;
                                imageUrl: string | null;
                                userId: string | null;
                            } | null | undefined;
                        } | null;
                        reference: string;
                        tags: string[];
                        timestamp: number;
                    }[] | null;
                    step: number;
                } | {
                    output: unknown;
                    params: Record<string, string | number | boolean>;
                    type: "dust_app_run_action";
                    id: number;
                    appId: string;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    appWorkspaceId: string;
                    appName: string;
                    runningBlock: {
                        status: "running" | "succeeded" | "errored";
                        type: string;
                        name: string;
                    } | null;
                } | {
                    params: Record<string, string | number | boolean>;
                    type: "tables_query_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    output: Record<string, string | number | boolean> | null;
                    resultsFileId: string | null;
                    resultsFileSnippet: string | null;
                    sectionFileId: string | null;
                } | {
                    params: {
                        relativeTimeFrame: {
                            duration: number;
                            unit: "hour" | "day" | "week" | "month" | "year";
                        } | null;
                    };
                    type: "process_action";
                    schema: {
                        type: "string" | "number" | "boolean";
                        name: string;
                        description: string;
                    }[];
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    outputs: {
                        data: unknown[];
                        min_timestamp: number;
                        total_documents: number;
                        total_chunks: number;
                        total_tokens: number;
                    } | null;
                } | {
                    type: "websearch_action";
                    id: number;
                    agentMessageId: number;
                    query: string;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    output: {
                        results: {
                            link: string;
                            title: string;
                            reference: string;
                            snippet: string;
                        }[];
                    } | {
                        error: string;
                        results: {
                            link: string;
                            title: string;
                            reference: string;
                            snippet: string;
                        }[];
                    } | null;
                } | {
                    type: "browse_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    output: {
                        results: {
                            content: string;
                            requestedUrl: string;
                            browsedUrl: string;
                            responseCode: string;
                            errorMessage: string;
                        }[];
                    } | null;
                    urls: string[];
                } | {
                    type: "conversation_list_files_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    files: ({
                        title: string;
                        contentType: "application/vnd.dust.datasource" | "application/json" | "application/vnd.dust.confluence.space" | "application/vnd.dust.confluence.page" | "application/vnd.dust.github.repository" | "application/vnd.dust.github.code-root" | "application/vnd.dust.github.code-directory" | "application/vnd.dust.github.code-file" | "application/vnd.dust.github.issues" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussions" | "application/vnd.dust.github.discussion" | "application/vnd.dust.googledrive.shared-with-me" | "application/vnd.dust.googledrive.folder" | "application/vnd.dust.googledrive.spreadsheet" | "application/vnd.dust.intercom.collection" | "application/vnd.dust.intercom.teams-folder" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.team" | "application/vnd.dust.intercom.article" | "application/vnd.dust.intercom.help-center" | "application/vnd.dust.microsoft.folder" | "application/vnd.dust.microsoft.spreadsheet" | "application/vnd.dust.notion.page" | "application/vnd.dust.notion.unknown-folder" | "application/vnd.dust.notion.syncing-folder" | "application/vnd.dust.notion.database" | "application/vnd.dust.slack.channel" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.snowflake.database" | "application/vnd.dust.snowflake.schema" | "application/vnd.dust.snowflake.table" | "application/vnd.dust.webcrawler.folder" | "application/vnd.dust.zendesk.article" | "application/vnd.dust.zendesk.help-center" | "application/vnd.dust.zendesk.brand" | "application/vnd.dust.zendesk.category" | "application/vnd.dust.zendesk.tickets" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.bigquery.database" | "application/vnd.dust.bigquery.schema" | "application/vnd.dust.bigquery.table" | "application/vnd.dust.salesforce.database" | "application/vnd.dust.salesforce.schema" | "application/vnd.dust.salesforce.table" | "application/vnd.dust.gong.transcript" | "application/vnd.dust.gong.transcript-folder" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/vnd.google-apps.document" | "application/vnd.google-apps.presentation" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.google-apps.spreadsheet" | "application/vnd.ms-excel" | "application/pdf" | "application/vnd.dust.section.json" | "text/comma-separated-values" | "text/csv" | "text/markdown" | "text/plain" | "text/tab-separated-values" | "text/tsv" | "text/vnd.dust.attachment.slack.thread" | "text/html" | "text/xml" | "text/calendar" | "text/css" | "text/javascript" | "text/typescript" | "application/xml" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script" | "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "dust-application/slack";
                        fileId: string;
                        nodeDataSourceViewId?: undefined;
                        contentFragmentId?: undefined;
                    } | {
                        title: string;
                        contentType: "application/vnd.dust.datasource" | "application/json" | "application/vnd.dust.confluence.space" | "application/vnd.dust.confluence.page" | "application/vnd.dust.github.repository" | "application/vnd.dust.github.code-root" | "application/vnd.dust.github.code-directory" | "application/vnd.dust.github.code-file" | "application/vnd.dust.github.issues" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussions" | "application/vnd.dust.github.discussion" | "application/vnd.dust.googledrive.shared-with-me" | "application/vnd.dust.googledrive.folder" | "application/vnd.dust.googledrive.spreadsheet" | "application/vnd.dust.intercom.collection" | "application/vnd.dust.intercom.teams-folder" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.team" | "application/vnd.dust.intercom.article" | "application/vnd.dust.intercom.help-center" | "application/vnd.dust.microsoft.folder" | "application/vnd.dust.microsoft.spreadsheet" | "application/vnd.dust.notion.page" | "application/vnd.dust.notion.unknown-folder" | "application/vnd.dust.notion.syncing-folder" | "application/vnd.dust.notion.database" | "application/vnd.dust.slack.channel" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.snowflake.database" | "application/vnd.dust.snowflake.schema" | "application/vnd.dust.snowflake.table" | "application/vnd.dust.webcrawler.folder" | "application/vnd.dust.zendesk.article" | "application/vnd.dust.zendesk.help-center" | "application/vnd.dust.zendesk.brand" | "application/vnd.dust.zendesk.category" | "application/vnd.dust.zendesk.tickets" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.bigquery.database" | "application/vnd.dust.bigquery.schema" | "application/vnd.dust.bigquery.table" | "application/vnd.dust.salesforce.database" | "application/vnd.dust.salesforce.schema" | "application/vnd.dust.salesforce.table" | "application/vnd.dust.gong.transcript" | "application/vnd.dust.gong.transcript-folder" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/vnd.google-apps.document" | "application/vnd.google-apps.presentation" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.google-apps.spreadsheet" | "application/vnd.ms-excel" | "application/pdf" | "application/vnd.dust.section.json" | "text/comma-separated-values" | "text/csv" | "text/markdown" | "text/plain" | "text/tab-separated-values" | "text/tsv" | "text/vnd.dust.attachment.slack.thread" | "text/html" | "text/xml" | "text/calendar" | "text/css" | "text/javascript" | "text/typescript" | "application/xml" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script" | "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "dust-application/slack";
                        nodeDataSourceViewId: string;
                        contentFragmentId: string;
                        fileId?: undefined;
                    })[];
                } | {
                    params: {
                        fileId: string;
                    };
                    type: "conversation_include_file_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    tokensCount: number | null;
                    fileTitle: string | null;
                } | {
                    type: "reasoning_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    output: string | null;
                    thinking: string | null;
                } | {
                    type: "search_labels_action";
                    id: number;
                    agentMessageId: number;
                    functionCallId: string | null;
                    functionCallName: string | null;
                    step: number;
                    output: {
                        tags: {
                            data_sources: string[];
                            tag: string;
                            match_count: number;
                        }[];
                    } | null;
                } | {
                    type: "tool_action";
                    id: number;
                    agentMessageId: number;
                    functionCallName: string | null;
                    params?: unknown;
                })[];
                chainOfThought: string | null;
                rawContents: {
                    content: string;
                    step: number;
                }[];
            };
            type: "agent_message_success";
            created: number;
            configurationId: string;
            messageId: string;
            runIds: string[];
        } | {
            type: "browse_params";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                type: "browse_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: {
                    results: {
                        content: string;
                        requestedUrl: string;
                        browsedUrl: string;
                        responseCode: string;
                        errorMessage: string;
                    }[];
                } | null;
                urls: string[];
            };
        } | {
            type: "conversation_include_file_params";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                params: {
                    fileId: string;
                };
                type: "conversation_include_file_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                tokensCount: number | null;
                fileTitle: string | null;
            };
        } | {
            type: "dust_app_run_block";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                output: unknown;
                params: Record<string, string | number | boolean>;
                type: "dust_app_run_action";
                id: number;
                appId: string;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                appWorkspaceId: string;
                appName: string;
                runningBlock: {
                    status: "running" | "succeeded" | "errored";
                    type: string;
                    name: string;
                } | null;
            };
        } | {
            type: "dust_app_run_params";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                output: unknown;
                params: Record<string, string | number | boolean>;
                type: "dust_app_run_action";
                id: number;
                appId: string;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                appWorkspaceId: string;
                appName: string;
                runningBlock: {
                    status: "running" | "succeeded" | "errored";
                    type: string;
                    name: string;
                } | null;
            };
        } | {
            type: "process_params";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                params: {
                    relativeTimeFrame: {
                        duration: number;
                        unit: "hour" | "day" | "week" | "month" | "year";
                    } | null;
                };
                type: "process_action";
                schema: {
                    type: "string" | "number" | "boolean";
                    name: string;
                    description: string;
                }[];
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                outputs: {
                    data: unknown[];
                    min_timestamp: number;
                    total_documents: number;
                    total_chunks: number;
                    total_tokens: number;
                } | null;
            };
            dataSources: {
                filter: {
                    parents: {
                        in: string[];
                        not: string[];
                    } | null;
                };
                workspaceId: string;
                dataSourceViewId: string;
            }[];
        } | {
            type: "reasoning_started";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                type: "reasoning_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: string | null;
                thinking: string | null;
            };
        } | {
            type: "reasoning_thinking";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                type: "reasoning_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: string | null;
                thinking: string | null;
            };
        } | {
            type: "reasoning_tokens";
            created: number;
            content: string;
            configurationId: string;
            messageId: string;
            action: {
                type: "reasoning_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: string | null;
                thinking: string | null;
            };
            classification: "tokens" | "chain_of_thought";
        } | {
            type: "retrieval_params";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                params: {
                    relativeTimeFrame: {
                        duration: number;
                        unit: "hour" | "day" | "week" | "month" | "year";
                    } | null;
                    query: string | null;
                    topK: number;
                };
                type: "retrieval_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                documents: {
                    id: number;
                    sourceUrl: string | null;
                    chunks: {
                        text: string;
                        offset: number;
                        score: number | null;
                    }[];
                    score: number | null;
                    documentId: string;
                    dataSourceView: {
                        sId: string;
                        id: number;
                        createdAt: number;
                        category: "folder" | "actions" | "managed" | "website" | "apps";
                        dataSource: {
                            sId: string;
                            id: number;
                            createdAt: number;
                            name: string;
                            description: string | null;
                            assistantDefaultSelected: boolean;
                            dustAPIProjectId: string;
                            dustAPIDataSourceId: string;
                            connectorId: string | null;
                            connectorProvider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
                            editedByUser?: {
                                email: string | null;
                                fullName: string | null;
                                editedAt: number | null;
                                imageUrl: string | null;
                                userId: string | null;
                            } | null | undefined;
                        };
                        kind: "custom" | "default";
                        parentsIn: string[] | null;
                        updatedAt: number;
                        spaceId: string;
                        editedByUser?: {
                            email: string | null;
                            fullName: string | null;
                            editedAt: number | null;
                            imageUrl: string | null;
                            userId: string | null;
                        } | null | undefined;
                    } | null;
                    reference: string;
                    tags: string[];
                    timestamp: number;
                }[] | null;
                step: number;
            };
            dataSources: {
                filter: {
                    parents: {
                        in: string[];
                        not: string[];
                    } | null;
                };
                workspaceId: string;
                dataSourceViewId: string;
            }[];
        } | {
            type: "search_labels_params";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                type: "search_labels_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: {
                    tags: {
                        data_sources: string[];
                        tag: string;
                        match_count: number;
                    }[];
                } | null;
            };
        } | {
            type: "tables_query_model_output";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                params: Record<string, string | number | boolean>;
                type: "tables_query_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: Record<string, string | number | boolean> | null;
                resultsFileId: string | null;
                resultsFileSnippet: string | null;
                sectionFileId: string | null;
            };
        } | {
            type: "tables_query_output";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                params: Record<string, string | number | boolean>;
                type: "tables_query_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: Record<string, string | number | boolean> | null;
                resultsFileId: string | null;
                resultsFileSnippet: string | null;
                sectionFileId: string | null;
            };
        } | {
            type: "tables_query_started";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                params: Record<string, string | number | boolean>;
                type: "tables_query_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: Record<string, string | number | boolean> | null;
                resultsFileId: string | null;
                resultsFileSnippet: string | null;
                sectionFileId: string | null;
            };
        } | {
            type: "websearch_params";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                type: "websearch_action";
                id: number;
                agentMessageId: number;
                query: string;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: {
                    results: {
                        link: string;
                        title: string;
                        reference: string;
                        snippet: string;
                    }[];
                } | {
                    error: string;
                    results: {
                        link: string;
                        title: string;
                        reference: string;
                        snippet: string;
                    }[];
                } | null;
            };
        } | {
            type: "tool_params";
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                type: "tool_action";
                id: number;
                agentMessageId: number;
                functionCallName: string | null;
                params?: unknown;
            };
        } | {
            type: "tool_approve_execution";
            inputs: Record<string, any>;
            created: number;
            configurationId: string;
            messageId: string;
            action: {
                type: "tool_action";
                id: number;
                agentMessageId: number;
                functionCallName: string | null;
                params?: unknown;
            };
            metadata: {
                mcpServerName: string;
                toolName: string;
                agentName: string;
            };
            stake?: "low" | "high" | undefined;
        }, void, unknown>;
    }>>;
    cancelMessageGeneration({ conversationId, messageIds, }: {
        conversationId: string;
        messageIds: string[];
    }): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        success: true;
    }>>;
    getConversations(): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        sId: string;
        id: number;
        created: number;
        requestedGroupIds: string[][];
        title: string | null;
        visibility: "workspace" | "deleted" | "unlisted" | "test";
        owner: {
            sId: string;
            id: number;
            name: string;
            role: "user" | "admin" | "builder" | "none";
            segmentation: "interesting" | null;
            whiteListedProviders: ("openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks")[] | null;
            defaultEmbeddingProvider: "openai" | "mistral" | null;
            ssoEnforced?: boolean | undefined;
        };
        groupIds?: string[] | undefined;
        updated?: number | undefined;
    }[]>>;
    getConversation({ conversationId }: {
        conversationId: string;
    }): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        sId: string;
        id: number;
        created: number;
        content: ({
            type: "user_message";
            sId: string;
            id: number;
            user: {
                sId: string;
                id: number;
                createdAt: number;
                provider: "github" | "auth0" | "google" | "okta" | "samlp" | "waad" | null;
                username: string;
                email: string;
                firstName: string;
                lastName: string | null;
                fullName: string;
                image: string | null;
            } | null;
            created: number;
            content: string;
            version: number;
            context: {
                username: string;
                timezone: string;
                email?: string | null | undefined;
                fullName?: string | null | undefined;
                profilePictureUrl?: string | null | undefined;
                origin?: "slack" | "zendesk" | "email" | "web" | "api" | "gsheet" | "zapier" | "n8n" | "make" | "raycast" | "github-copilot-chat" | "extension" | null | undefined;
                localMCPServerIds?: string[] | null | undefined;
            };
            visibility: "visible" | "deleted";
            mentions: {
                configurationId: string;
            }[];
        }[] | {
            status: "created" | "succeeded" | "failed" | "cancelled";
            type: "agent_message";
            sId: string;
            id: number;
            error: {
                code: string;
                message: string;
            } | null;
            created: number;
            content: string | null;
            version: number;
            visibility: "visible" | "deleted";
            agentMessageId: number;
            parentMessageId: string | null;
            configuration: {
                status: "active" | "archived" | "draft" | "disabled_by_admin" | "disabled_missing_datasource" | "disabled_free_workspace";
                sId: string;
                id: number;
                name: string;
                description: string;
                versionCreatedAt: string | null;
                version: number;
                versionAuthorId: number | null;
                instructions: string | null;
                model: {
                    providerId: "openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks";
                    modelId: "gpt-3.5-turbo" | "gpt-4-turbo" | "gpt-4o-2024-08-06" | "gpt-4o" | "gpt-4o-mini" | "gpt-4.1-2025-04-14" | "gpt-4.1-mini-2025-04-14" | "o1" | "o1-mini" | "o3-mini" | "claude-3-opus-20240229" | "claude-3-5-sonnet-20240620" | "claude-3-5-sonnet-20241022" | "claude-3-7-sonnet-20250219" | "claude-3-5-haiku-20241022" | "claude-3-haiku-20240307" | "claude-2.1" | "claude-instant-1.2" | "mistral-large-latest" | "mistral-medium" | "mistral-small-latest" | "codestral-latest" | "gemini-1.5-pro-latest" | "gemini-1.5-flash-latest" | "gemini-2.0-flash" | "gemini-2.0-flash-lite" | "gemini-2.5-pro-preview-03-25" | "gemini-2.0-flash-exp" | "gemini-2.0-flash-lite-preview-02-05" | "gemini-2.0-pro-exp-02-05" | "gemini-2.0-flash-thinking-exp-01-21" | "meta-llama/Llama-3.3-70B-Instruct-Turbo" | "Qwen/Qwen2.5-Coder-32B-Instruct" | "Qwen/QwQ-32B-Preview" | "Qwen/Qwen2-72B-Instruct" | "deepseek-ai/DeepSeek-V3" | "deepseek-ai/DeepSeek-R1" | "deepseek-chat" | "deepseek-reasoner" | "accounts/fireworks/models/deepseek-r1";
                    temperature: number;
                };
                scope: "workspace" | "published" | "global" | "private";
                userFavorite: boolean;
                pictureUrl: string;
                maxStepsPerRun: number;
                visualizationEnabled: boolean;
                templateId: string | null;
                requestedGroupIds: string[][];
                lastAuthors?: readonly string[] | undefined;
                usage?: {
                    messageCount: number;
                    conversationCount: number;
                    userCount: number;
                    timePeriodSec: number;
                } | undefined;
                groupIds?: string[] | undefined;
            };
            actions: ({
                params: {
                    relativeTimeFrame: {
                        duration: number;
                        unit: "hour" | "day" | "week" | "month" | "year";
                    } | null;
                    query: string | null;
                    topK: number;
                };
                type: "retrieval_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                documents: {
                    id: number;
                    sourceUrl: string | null;
                    chunks: {
                        text: string;
                        offset: number;
                        score: number | null;
                    }[];
                    score: number | null;
                    documentId: string;
                    dataSourceView: {
                        sId: string;
                        id: number;
                        createdAt: number;
                        category: "folder" | "actions" | "managed" | "website" | "apps";
                        dataSource: {
                            sId: string;
                            id: number;
                            createdAt: number;
                            name: string;
                            description: string | null;
                            assistantDefaultSelected: boolean;
                            dustAPIProjectId: string;
                            dustAPIDataSourceId: string;
                            connectorId: string | null;
                            connectorProvider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
                            editedByUser?: {
                                email: string | null;
                                fullName: string | null;
                                editedAt: number | null;
                                imageUrl: string | null;
                                userId: string | null;
                            } | null | undefined;
                        };
                        kind: "custom" | "default";
                        parentsIn: string[] | null;
                        updatedAt: number;
                        spaceId: string;
                        editedByUser?: {
                            email: string | null;
                            fullName: string | null;
                            editedAt: number | null;
                            imageUrl: string | null;
                            userId: string | null;
                        } | null | undefined;
                    } | null;
                    reference: string;
                    tags: string[];
                    timestamp: number;
                }[] | null;
                step: number;
            } | {
                output: unknown;
                params: Record<string, string | number | boolean>;
                type: "dust_app_run_action";
                id: number;
                appId: string;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                appWorkspaceId: string;
                appName: string;
                runningBlock: {
                    status: "running" | "succeeded" | "errored";
                    type: string;
                    name: string;
                } | null;
            } | {
                params: Record<string, string | number | boolean>;
                type: "tables_query_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: Record<string, string | number | boolean> | null;
                resultsFileId: string | null;
                resultsFileSnippet: string | null;
                sectionFileId: string | null;
            } | {
                params: {
                    relativeTimeFrame: {
                        duration: number;
                        unit: "hour" | "day" | "week" | "month" | "year";
                    } | null;
                };
                type: "process_action";
                schema: {
                    type: "string" | "number" | "boolean";
                    name: string;
                    description: string;
                }[];
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                outputs: {
                    data: unknown[];
                    min_timestamp: number;
                    total_documents: number;
                    total_chunks: number;
                    total_tokens: number;
                } | null;
            } | {
                type: "websearch_action";
                id: number;
                agentMessageId: number;
                query: string;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: {
                    results: {
                        link: string;
                        title: string;
                        reference: string;
                        snippet: string;
                    }[];
                } | {
                    error: string;
                    results: {
                        link: string;
                        title: string;
                        reference: string;
                        snippet: string;
                    }[];
                } | null;
            } | {
                type: "browse_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: {
                    results: {
                        content: string;
                        requestedUrl: string;
                        browsedUrl: string;
                        responseCode: string;
                        errorMessage: string;
                    }[];
                } | null;
                urls: string[];
            } | {
                type: "conversation_list_files_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                files: ({
                    title: string;
                    contentType: "application/vnd.dust.datasource" | "application/json" | "application/vnd.dust.confluence.space" | "application/vnd.dust.confluence.page" | "application/vnd.dust.github.repository" | "application/vnd.dust.github.code-root" | "application/vnd.dust.github.code-directory" | "application/vnd.dust.github.code-file" | "application/vnd.dust.github.issues" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussions" | "application/vnd.dust.github.discussion" | "application/vnd.dust.googledrive.shared-with-me" | "application/vnd.dust.googledrive.folder" | "application/vnd.dust.googledrive.spreadsheet" | "application/vnd.dust.intercom.collection" | "application/vnd.dust.intercom.teams-folder" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.team" | "application/vnd.dust.intercom.article" | "application/vnd.dust.intercom.help-center" | "application/vnd.dust.microsoft.folder" | "application/vnd.dust.microsoft.spreadsheet" | "application/vnd.dust.notion.page" | "application/vnd.dust.notion.unknown-folder" | "application/vnd.dust.notion.syncing-folder" | "application/vnd.dust.notion.database" | "application/vnd.dust.slack.channel" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.snowflake.database" | "application/vnd.dust.snowflake.schema" | "application/vnd.dust.snowflake.table" | "application/vnd.dust.webcrawler.folder" | "application/vnd.dust.zendesk.article" | "application/vnd.dust.zendesk.help-center" | "application/vnd.dust.zendesk.brand" | "application/vnd.dust.zendesk.category" | "application/vnd.dust.zendesk.tickets" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.bigquery.database" | "application/vnd.dust.bigquery.schema" | "application/vnd.dust.bigquery.table" | "application/vnd.dust.salesforce.database" | "application/vnd.dust.salesforce.schema" | "application/vnd.dust.salesforce.table" | "application/vnd.dust.gong.transcript" | "application/vnd.dust.gong.transcript-folder" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/vnd.google-apps.document" | "application/vnd.google-apps.presentation" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.google-apps.spreadsheet" | "application/vnd.ms-excel" | "application/pdf" | "application/vnd.dust.section.json" | "text/comma-separated-values" | "text/csv" | "text/markdown" | "text/plain" | "text/tab-separated-values" | "text/tsv" | "text/vnd.dust.attachment.slack.thread" | "text/html" | "text/xml" | "text/calendar" | "text/css" | "text/javascript" | "text/typescript" | "application/xml" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script" | "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "dust-application/slack";
                    fileId: string;
                    nodeDataSourceViewId?: undefined;
                    contentFragmentId?: undefined;
                } | {
                    title: string;
                    contentType: "application/vnd.dust.datasource" | "application/json" | "application/vnd.dust.confluence.space" | "application/vnd.dust.confluence.page" | "application/vnd.dust.github.repository" | "application/vnd.dust.github.code-root" | "application/vnd.dust.github.code-directory" | "application/vnd.dust.github.code-file" | "application/vnd.dust.github.issues" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussions" | "application/vnd.dust.github.discussion" | "application/vnd.dust.googledrive.shared-with-me" | "application/vnd.dust.googledrive.folder" | "application/vnd.dust.googledrive.spreadsheet" | "application/vnd.dust.intercom.collection" | "application/vnd.dust.intercom.teams-folder" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.team" | "application/vnd.dust.intercom.article" | "application/vnd.dust.intercom.help-center" | "application/vnd.dust.microsoft.folder" | "application/vnd.dust.microsoft.spreadsheet" | "application/vnd.dust.notion.page" | "application/vnd.dust.notion.unknown-folder" | "application/vnd.dust.notion.syncing-folder" | "application/vnd.dust.notion.database" | "application/vnd.dust.slack.channel" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.snowflake.database" | "application/vnd.dust.snowflake.schema" | "application/vnd.dust.snowflake.table" | "application/vnd.dust.webcrawler.folder" | "application/vnd.dust.zendesk.article" | "application/vnd.dust.zendesk.help-center" | "application/vnd.dust.zendesk.brand" | "application/vnd.dust.zendesk.category" | "application/vnd.dust.zendesk.tickets" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.bigquery.database" | "application/vnd.dust.bigquery.schema" | "application/vnd.dust.bigquery.table" | "application/vnd.dust.salesforce.database" | "application/vnd.dust.salesforce.schema" | "application/vnd.dust.salesforce.table" | "application/vnd.dust.gong.transcript" | "application/vnd.dust.gong.transcript-folder" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/vnd.google-apps.document" | "application/vnd.google-apps.presentation" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.google-apps.spreadsheet" | "application/vnd.ms-excel" | "application/pdf" | "application/vnd.dust.section.json" | "text/comma-separated-values" | "text/csv" | "text/markdown" | "text/plain" | "text/tab-separated-values" | "text/tsv" | "text/vnd.dust.attachment.slack.thread" | "text/html" | "text/xml" | "text/calendar" | "text/css" | "text/javascript" | "text/typescript" | "application/xml" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script" | "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "dust-application/slack";
                    nodeDataSourceViewId: string;
                    contentFragmentId: string;
                    fileId?: undefined;
                })[];
            } | {
                params: {
                    fileId: string;
                };
                type: "conversation_include_file_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                tokensCount: number | null;
                fileTitle: string | null;
            } | {
                type: "reasoning_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: string | null;
                thinking: string | null;
            } | {
                type: "search_labels_action";
                id: number;
                agentMessageId: number;
                functionCallId: string | null;
                functionCallName: string | null;
                step: number;
                output: {
                    tags: {
                        data_sources: string[];
                        tag: string;
                        match_count: number;
                    }[];
                } | null;
            } | {
                type: "tool_action";
                id: number;
                agentMessageId: number;
                functionCallName: string | null;
                params?: unknown;
            })[];
            chainOfThought: string | null;
            rawContents: {
                content: string;
                step: number;
            }[];
        }[] | {
            type: "content_fragment";
            sId: string;
            id: number;
            created: number;
            version: number;
            title: string;
            contentType: "application/vnd.dust.datasource" | "application/json" | "application/vnd.dust.confluence.space" | "application/vnd.dust.confluence.page" | "application/vnd.dust.github.repository" | "application/vnd.dust.github.code-root" | "application/vnd.dust.github.code-directory" | "application/vnd.dust.github.code-file" | "application/vnd.dust.github.issues" | "application/vnd.dust.github.issue" | "application/vnd.dust.github.discussions" | "application/vnd.dust.github.discussion" | "application/vnd.dust.googledrive.shared-with-me" | "application/vnd.dust.googledrive.folder" | "application/vnd.dust.googledrive.spreadsheet" | "application/vnd.dust.intercom.collection" | "application/vnd.dust.intercom.teams-folder" | "application/vnd.dust.intercom.conversation" | "application/vnd.dust.intercom.team" | "application/vnd.dust.intercom.article" | "application/vnd.dust.intercom.help-center" | "application/vnd.dust.microsoft.folder" | "application/vnd.dust.microsoft.spreadsheet" | "application/vnd.dust.notion.page" | "application/vnd.dust.notion.unknown-folder" | "application/vnd.dust.notion.syncing-folder" | "application/vnd.dust.notion.database" | "application/vnd.dust.slack.channel" | "application/vnd.dust.slack.thread" | "application/vnd.dust.slack.messages" | "application/vnd.dust.snowflake.database" | "application/vnd.dust.snowflake.schema" | "application/vnd.dust.snowflake.table" | "application/vnd.dust.webcrawler.folder" | "application/vnd.dust.zendesk.article" | "application/vnd.dust.zendesk.help-center" | "application/vnd.dust.zendesk.brand" | "application/vnd.dust.zendesk.category" | "application/vnd.dust.zendesk.tickets" | "application/vnd.dust.zendesk.ticket" | "application/vnd.dust.bigquery.database" | "application/vnd.dust.bigquery.schema" | "application/vnd.dust.bigquery.table" | "application/vnd.dust.salesforce.database" | "application/vnd.dust.salesforce.schema" | "application/vnd.dust.salesforce.table" | "application/vnd.dust.gong.transcript" | "application/vnd.dust.gong.transcript-folder" | "application/msword" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | "application/vnd.ms-powerpoint" | "application/vnd.openxmlformats-officedocument.presentationml.presentation" | "application/vnd.google-apps.document" | "application/vnd.google-apps.presentation" | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" | "application/vnd.google-apps.spreadsheet" | "application/vnd.ms-excel" | "application/pdf" | "application/vnd.dust.section.json" | "text/comma-separated-values" | "text/csv" | "text/markdown" | "text/plain" | "text/tab-separated-values" | "text/tsv" | "text/vnd.dust.attachment.slack.thread" | "text/html" | "text/xml" | "text/calendar" | "text/css" | "text/javascript" | "text/typescript" | "application/xml" | "application/x-sh" | "text/x-sh" | "text/x-python" | "text/x-python-script" | "application/x-yaml" | "text/yaml" | "text/vnd.yaml" | "text/x-c" | "text/x-csharp" | "text/x-java-source" | "text/x-php" | "text/x-ruby" | "text/x-sql" | "text/x-swift" | "text/x-rust" | "text/x-go" | "text/x-kotlin" | "text/x-scala" | "text/x-groovy" | "text/x-perl" | "text/x-perl-script" | "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "dust-application/slack";
            fileId: string | null;
            context: {
                username?: string | null | undefined;
                email?: string | null | undefined;
                fullName?: string | null | undefined;
                profilePictureUrl?: string | null | undefined;
            };
            visibility: "visible" | "deleted";
            sourceUrl: string | null;
            textUrl: string;
            textBytes: number | null;
            contentFragmentId: string;
            contentFragmentVersion: "latest" | "superseded";
            contentNodeData: {
                provider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
                nodeId: string;
                nodeDataSourceViewId: string;
                nodeType: "table" | "folder" | "document";
                spaceName: string;
            } | null;
        }[])[];
        requestedGroupIds: string[][];
        title: string | null;
        visibility: "workspace" | "deleted" | "unlisted" | "test";
        owner: {
            sId: string;
            id: number;
            name: string;
            role: "user" | "admin" | "builder" | "none";
            segmentation: "interesting" | null;
            whiteListedProviders: ("openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks")[] | null;
            defaultEmbeddingProvider: "openai" | "mistral" | null;
            ssoEnforced?: boolean | undefined;
        };
        groupIds?: string[] | undefined;
        updated?: number | undefined;
    }>>;
    getConversationFeedback({ conversationId, }: {
        conversationId: string;
    }): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        createdAt: number;
        content: string | null;
        userId: number;
        agentMessageId: number;
        messageId: string;
        thumbDirection: "up" | "down";
        agentConfigurationId: string;
        agentConfigurationVersion: number;
        isConversationShared: boolean;
    }[]>>;
    postFeedback(conversationId: string, messageId: string, feedback: PublicPostMessageFeedbackRequestBody): Promise<Result<{
        success: true;
    }, {
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }>>;
    deleteFeedback(conversationId: string, messageId: string): Promise<Result<{
        success: true;
    }, {
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }>>;
    tokenize(text: string, dataSourceId: string): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<[number, string][]>>;
    upsertFolder({ dataSourceId, folderId, timestamp, title, parentId, parents, mimeType, sourceUrl, providerVisibility, }: {
        dataSourceId: string;
        folderId: string;
        timestamp: number;
        title: string;
        parentId: string | null;
        parents: string[];
        mimeType: string;
        sourceUrl: string | null;
        providerVisibility: "public" | "private" | null;
    }): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        data_source: {
            sId: string;
            id: number;
            createdAt: number;
            name: string;
            description: string | null;
            assistantDefaultSelected: boolean;
            dustAPIProjectId: string;
            dustAPIDataSourceId: string;
            connectorId: string | null;
            connectorProvider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
            editedByUser?: {
                email: string | null;
                fullName: string | null;
                editedAt: number | null;
                imageUrl: string | null;
                userId: string | null;
            } | null | undefined;
        };
        folder: {
            title: string;
            timestamp: number;
            parents: string[];
            data_source_id: string;
            folder_id: string;
        };
    }>>;
    deleteFolder({ dataSourceId, folderId, }: {
        dataSourceId: string;
        folderId: string;
    }): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        folder: {
            folder_id: string;
        };
    }>>;
    uploadFile({ contentType, fileName, fileSize, useCase, useCaseMetadata, fileObject, }: FileUploadUrlRequestType & {
        fileObject: File;
    }): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Err<Error> | Ok<{
        status: "created" | "failed" | "ready";
        sId: string;
        id: string;
        contentType: string;
        fileName: string;
        fileSize: number;
        useCase: "conversation" | "upsert_table" | "avatar" | "tool_output" | "upsert_document" | "folders_document";
        downloadUrl?: string | undefined;
        uploadUrl?: string | undefined;
        publicUrl?: string | undefined;
    }>>;
    deleteFile({ fileID }: {
        fileID: string;
    }): Promise<Result<{
        response: DustResponse;
        duration: number;
    }, {
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }>>;
    getActiveMemberEmailsInWorkspace(): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<string[]>>;
    getWorkspaceVerifiedDomains(): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        domain: string;
        domainAutoJoinEnabled: boolean;
    }[]>>;
    getWorkspaceFeatureFlags(): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<("usage_data_api" | "okta_enterprise_connection" | "co_edition" | "labs_transcripts" | "labs_connection_hubspot" | "labs_connection_linear" | "labs_trackers" | "labs_salesforce_personal_connections" | "document_tracker" | "openai_o1_feature" | "openai_o1_mini_feature" | "openai_o1_high_reasoning_feature" | "openai_o1_custom_assistants_feature" | "openai_o1_high_reasoning_custom_assistants_feature" | "deepseek_feature" | "google_ai_studio_experimental_models_feature" | "snowflake_connector_feature" | "index_private_slack_channel" | "disable_run_logs" | "show_debug_tools" | "deepseek_r1_global_agent_feature" | "salesforce_feature" | "advanced_notion_management" | "search_knowledge_builder" | "force_gdrive_labels_scope" | "claude_3_7_reasoning" | "mcp_actions" | "dev_mcp_actions" | "agent_discovery")[]>>;
    searchDataSourceViews(searchParams: URLSearchParams): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        sId: string;
        id: number;
        createdAt: number;
        category: "folder" | "actions" | "managed" | "website" | "apps";
        dataSource: {
            sId: string;
            id: number;
            createdAt: number;
            name: string;
            description: string | null;
            assistantDefaultSelected: boolean;
            dustAPIProjectId: string;
            dustAPIDataSourceId: string;
            connectorId: string | null;
            connectorProvider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
            editedByUser?: {
                email: string | null;
                fullName: string | null;
                editedAt: number | null;
                imageUrl: string | null;
                userId: string | null;
            } | null | undefined;
        };
        kind: "custom" | "default";
        parentsIn: string[] | null;
        updatedAt: number;
        spaceId: string;
        editedByUser?: {
            email: string | null;
            fullName: string | null;
            editedAt: number | null;
            imageUrl: string | null;
            userId: string | null;
        } | null | undefined;
    }[]>>;
    patchDataSourceView(dataSourceView: DataSourceViewType, patch: PatchDataSourceViewRequestType): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        sId: string;
        id: number;
        createdAt: number;
        category: "folder" | "actions" | "managed" | "website" | "apps";
        dataSource: {
            sId: string;
            id: number;
            createdAt: number;
            name: string;
            description: string | null;
            assistantDefaultSelected: boolean;
            dustAPIProjectId: string;
            dustAPIDataSourceId: string;
            connectorId: string | null;
            connectorProvider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
            editedByUser?: {
                email: string | null;
                fullName: string | null;
                editedAt: number | null;
                imageUrl: string | null;
                userId: string | null;
            } | null | undefined;
        };
        kind: "custom" | "default";
        parentsIn: string[] | null;
        updatedAt: number;
        spaceId: string;
        editedByUser?: {
            email: string | null;
            fullName: string | null;
            editedAt: number | null;
            imageUrl: string | null;
            userId: string | null;
        } | null | undefined;
    }>>;
    exportApps({ appSpaceId }: {
        appSpaceId: string;
    }): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        sId: string;
        id: number;
        name: string;
        description: string | null;
        dustAPIProjectId: string;
        space: {
            sId: string;
            createdAt: number;
            name: string;
            groupIds: string[];
            kind: "global" | "conversations" | "public" | "regular" | "system";
            updatedAt: number;
            isRestricted: boolean;
        };
        savedSpecification: string | null;
        savedConfig: string | null;
        savedRun: string | null;
        datasets?: {
            name: string;
            description: string | null;
            schema?: {
                type: "string" | "number" | "boolean" | "json";
                key: string;
                description: string | null;
            }[] | null | undefined;
            data?: Record<string, any>[] | null | undefined;
        }[] | undefined;
        coreSpecifications?: Record<string, string> | undefined;
    }[]>>;
    checkApps(apps: AppsCheckRequestType, appSpaceId: string): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        appId: string;
        appHash: string;
        deployed: boolean;
    }[]>>;
    getSpaces(): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<{
        sId: string;
        createdAt: number;
        name: string;
        groupIds: string[];
        kind: "global" | "conversations" | "public" | "regular" | "system";
        updatedAt: number;
        isRestricted: boolean;
    }[]>>;
    searchNodes(searchParams: SearchRequestBodyType): Promise<Err<{
        message: string;
        type: "action_api_error" | "action_failed" | "action_unknown_error" | "agent_configuration_not_found" | "agent_message_error" | "app_auth_error" | "app_not_found" | "assistant_saving_error" | "chat_message_not_found" | "connector_credentials_error" | "connector_not_found_error" | "connector_oauth_target_mismatch" | "connector_provider_not_supported" | "connector_update_error" | "connector_update_unauthorized" | "content_too_large" | "conversation_access_restricted" | "conversation_not_found" | "data_source_auth_error" | "data_source_document_not_found" | "data_source_error" | "data_source_not_found" | "data_source_not_managed" | "data_source_quota_error" | "data_source_view_not_found" | "dataset_not_found" | "dust_app_secret_not_found" | "expired_oauth_token_error" | "feature_flag_already_exists" | "feature_flag_not_found" | "file_not_found" | "file_too_large" | "file_type_not_supported" | "global_agent_error" | "group_not_found" | "internal_server_error" | "invalid_api_key_error" | "invalid_oauth_token_error" | "invalid_pagination_parameters" | "invalid_request_error" | "invalid_rows_request_error" | "invitation_already_sent_recently" | "invitation_not_found" | "key_not_found" | "malformed_authorization_header_error" | "membership_not_found" | "message_not_found" | "method_not_supported_error" | "missing_authorization_header_error" | "not_authenticated" | "personal_workspace_not_found" | "plan_limit_error" | "plan_message_limit_exceeded" | "plugin_execution_failed" | "plugin_not_found" | "provider_auth_error" | "provider_not_found" | "rate_limit_error" | "run_error" | "run_not_found" | "space_already_exists" | "space_not_found" | "stripe_invalid_product_id_error" | "subscription_not_found" | "subscription_payment_failed" | "subscription_state_invalid" | "table_not_found" | "template_not_found" | "labs_connection_configuration_already_exists" | "transcripts_configuration_already_exists" | "transcripts_configuration_default_not_allowed" | "transcripts_configuration_not_found" | "unexpected_action_response" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "user_not_found" | "workspace_auth_error" | "workspace_not_found" | "workspace_user_not_found";
        data_source_error?: {
            code: string;
            message: string;
        } | undefined;
        run_error?: {
            code: string;
            message: string;
        } | undefined;
        app_error?: {
            code: string;
            message: string;
        } | undefined;
        connectors_error?: {
            message: string;
            type: "connector_oauth_target_mismatch" | "connector_update_error" | "connector_update_unauthorized" | "internal_server_error" | "invalid_request_error" | "unexpected_error_format" | "unexpected_network_error" | "unexpected_response_format" | "authorization_error" | "not_found" | "unknown_connector_provider" | "connector_authorization_error" | "connector_not_found" | "connector_configuration_not_found" | "connector_oauth_error" | "slack_channel_not_found" | "connector_rate_limit_error" | "slack_configuration_not_found" | "google_drive_webhook_not_found";
        } | undefined;
    }> | Ok<({
        type: "table" | "folder" | "document";
        mimeType: string;
        title: string;
        expandable: boolean;
        internalId: string;
        lastUpdatedAt: number | null;
        parentInternalId: string | null;
        sourceUrl?: string | null | undefined;
        providerVisibility?: "private" | "public" | null | undefined;
        preventSelection?: boolean | undefined;
    } & {
        parentsInternalIds?: string[] | undefined;
        parentTitle?: string | null | undefined;
    } & {
        dataSource: {
            sId: string;
            id: number;
            createdAt: number;
            name: string;
            description: string | null;
            assistantDefaultSelected: boolean;
            dustAPIProjectId: string;
            dustAPIDataSourceId: string;
            connectorId: string | null;
            connectorProvider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
            editedByUser?: {
                email: string | null;
                fullName: string | null;
                editedAt: number | null;
                imageUrl: string | null;
                userId: string | null;
            } | null | undefined;
        };
        dataSourceViews: {
            sId: string;
            id: number;
            createdAt: number;
            category: "folder" | "actions" | "managed" | "website" | "apps";
            dataSource: {
                sId: string;
                id: number;
                createdAt: number;
                name: string;
                description: string | null;
                assistantDefaultSelected: boolean;
                dustAPIProjectId: string;
                dustAPIDataSourceId: string;
                connectorId: string | null;
                connectorProvider: "confluence" | "github" | "google_drive" | "intercom" | "notion" | "slack" | "microsoft" | "webcrawler" | "snowflake" | "zendesk" | "bigquery" | "salesforce" | "gong" | null;
                editedByUser?: {
                    email: string | null;
                    fullName: string | null;
                    editedAt: number | null;
                    imageUrl: string | null;
                    userId: string | null;
                } | null | undefined;
            };
            kind: "custom" | "default";
            parentsIn: string[] | null;
            updatedAt: number;
            spaceId: string;
            editedByUser?: {
                email: string | null;
                fullName: string | null;
                editedAt: number | null;
                imageUrl: string | null;
                userId: string | null;
            } | null | undefined;
        }[];
    })[]>>;
    private _fetchWithError;
    validateAction({ conversationId, messageId, actionId, approved, }: ValidateActionRequestBodyType & {
        conversationId: string;
        messageId: string;
    }): Promise<Result<ValidateActionResponseType, APIError>>;
    registerMCPServer({ serverId, }: {
        serverId: string;
    }): Promise<Result<RegisterMCPResponseType, APIError>>;
    heartbeatMCPServer({ serverId, }: {
        serverId: string;
    }): Promise<Result<HeartbeatMCPResponseType, APIError>>;
    postMCPResults({ requestId, result, serverId, }: PublicPostMCPResultsRequestBody & {
        serverId: string;
    }): Promise<Result<PostMCPResultsResponseType, APIError>>;
    getMCPRequestsConnectionDetails({ serverId, lastEventId, }: {
        serverId: string;
        lastEventId?: string | null;
    }): Promise<Result<{
        url: string;
        headers: Record<string, string>;
    }, APIError>>;
    private _resultFromResponse;
}
//# sourceMappingURL=index.d.ts.map