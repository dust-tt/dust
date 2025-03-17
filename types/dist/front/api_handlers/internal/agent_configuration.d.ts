import * as t from "io-ts";
export declare const GetAgentConfigurationsQuerySchema: t.TypeC<{
    view: t.UnionC<[t.LiteralC<"current_user">, t.LiteralC<"list">, t.LiteralC<"workspace">, t.LiteralC<"published">, t.LiteralC<"global">, t.LiteralC<"admin_internal">, t.LiteralC<"all">, t.UndefinedC]>;
    withUsage: t.UnionC<[t.LiteralC<"true">, t.LiteralC<"false">, t.UndefinedC]>;
    withAuthors: t.UnionC<[t.LiteralC<"true">, t.LiteralC<"false">, t.UndefinedC]>;
    withFeedbacks: t.UnionC<[t.LiteralC<"true">, t.LiteralC<"false">, t.UndefinedC]>;
    limit: t.UnionC<[t.BrandC<t.NumberC, import("../../../shared/utils/iots_utils").BrandedRange>, t.UndefinedC]>;
    sort: t.UnionC<[t.LiteralC<"priority">, t.LiteralC<"alphabetical">, t.UndefinedC]>;
}>;
export declare const GetAgentConfigurationsHistoryQuerySchema: t.TypeC<{
    limit: t.UnionC<[t.BrandC<t.NumberC, import("../../../shared/utils/iots_utils").BrandedRange>, t.UndefinedC]>;
}>;
export declare const GetAgentConfigurationsLeaderboardQuerySchema: t.TypeC<{
    view: t.UnionC<[t.LiteralC<"list">, t.LiteralC<"workspace">, t.LiteralC<"published">, t.LiteralC<"global">, t.LiteralC<"admin_internal">, t.LiteralC<"manage-assistants-search">, t.LiteralC<"all">]>;
}>;
export declare const PostOrPatchAgentConfigurationRequestBodySchema: t.TypeC<{
    assistant: t.TypeC<{
        name: t.StringC;
        description: t.StringC;
        instructions: t.UnionC<[t.StringC, t.NullC]>;
        pictureUrl: t.StringC;
        status: t.UnionC<[t.LiteralC<"active">, t.LiteralC<"archived">, t.LiteralC<"draft">]>;
        scope: t.UnionC<[t.LiteralC<"workspace">, t.LiteralC<"published">, t.LiteralC<"private">]>;
        model: t.IntersectionC<[t.IntersectionC<[t.TypeC<{
            modelId: t.Type<"gpt-3.5-turbo" | "gpt-4-turbo" | "gpt-4o" | "gpt-4o-2024-08-06" | "gpt-4o-mini" | "o1" | "o1-mini" | "o3-mini" | "claude-3-opus-20240229" | "claude-3-5-sonnet-20240620" | "claude-3-5-sonnet-20241022" | "claude-3-7-sonnet-20250219" | "claude-3-haiku-20240307" | "claude-3-5-haiku-20241022" | "claude-2.1" | "claude-instant-1.2" | "mistral-large-latest" | "mistral-medium" | "mistral-small-latest" | "codestral-latest" | "gemini-1.5-pro-latest" | "gemini-1.5-flash-latest" | "gemini-2.0-flash-exp" | "gemini-2.0-flash-thinking-exp-01-21" | "gemini-2.0-flash" | "gemini-2.0-flash-lite-preview-02-05" | "gemini-2.0-pro-exp-02-05" | "meta-llama/Llama-3.3-70B-Instruct-Turbo" | "Qwen/Qwen2.5-Coder-32B-Instruct" | "Qwen/QwQ-32B-Preview" | "Qwen/Qwen2-72B-Instruct" | "deepseek-ai/DeepSeek-V3" | "deepseek-ai/DeepSeek-R1" | "deepseek-chat" | "deepseek-reasoner" | "accounts/fireworks/models/deepseek-r1", "gpt-3.5-turbo" | "gpt-4-turbo" | "gpt-4o" | "gpt-4o-2024-08-06" | "gpt-4o-mini" | "o1" | "o1-mini" | "o3-mini" | "claude-3-opus-20240229" | "claude-3-5-sonnet-20240620" | "claude-3-5-sonnet-20241022" | "claude-3-7-sonnet-20250219" | "claude-3-haiku-20240307" | "claude-3-5-haiku-20241022" | "claude-2.1" | "claude-instant-1.2" | "mistral-large-latest" | "mistral-medium" | "mistral-small-latest" | "codestral-latest" | "gemini-1.5-pro-latest" | "gemini-1.5-flash-latest" | "gemini-2.0-flash-exp" | "gemini-2.0-flash-thinking-exp-01-21" | "gemini-2.0-flash" | "gemini-2.0-flash-lite-preview-02-05" | "gemini-2.0-pro-exp-02-05" | "meta-llama/Llama-3.3-70B-Instruct-Turbo" | "Qwen/Qwen2.5-Coder-32B-Instruct" | "Qwen/QwQ-32B-Preview" | "Qwen/Qwen2-72B-Instruct" | "deepseek-ai/DeepSeek-V3" | "deepseek-ai/DeepSeek-R1" | "deepseek-chat" | "deepseek-reasoner" | "accounts/fireworks/models/deepseek-r1", unknown>;
            providerId: t.Type<"openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks", "openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks", unknown>;
            temperature: t.NumberC;
        }>, t.PartialC<{
            name: t.UnionC<[t.StringC, t.NullC]>;
            description: t.UnionC<[t.StringC, t.NullC]>;
        }>, t.PartialC<{
            reasoningEffort: t.Type<"low" | "medium" | "high", "low" | "medium" | "high", unknown>;
        }>]>, t.Type<{
            modelId: "gpt-3.5-turbo" | "gpt-4-turbo" | "gpt-4o" | "gpt-4o-2024-08-06" | "gpt-4o-mini" | "o1" | "o1-mini" | "o3-mini" | "claude-3-opus-20240229" | "claude-3-5-sonnet-20240620" | "claude-3-5-sonnet-20241022" | "claude-3-7-sonnet-20250219" | "claude-3-haiku-20240307" | "claude-3-5-haiku-20241022" | "claude-2.1" | "claude-instant-1.2" | "mistral-large-latest" | "mistral-medium" | "mistral-small-latest" | "codestral-latest" | "gemini-1.5-pro-latest" | "gemini-1.5-flash-latest" | "gemini-2.0-flash-exp" | "gemini-2.0-flash-thinking-exp-01-21" | "gemini-2.0-flash" | "gemini-2.0-flash-lite-preview-02-05" | "gemini-2.0-pro-exp-02-05" | "meta-llama/Llama-3.3-70B-Instruct-Turbo" | "Qwen/Qwen2.5-Coder-32B-Instruct" | "Qwen/QwQ-32B-Preview" | "Qwen/Qwen2-72B-Instruct" | "deepseek-ai/DeepSeek-V3" | "deepseek-ai/DeepSeek-R1" | "deepseek-chat" | "deepseek-reasoner" | "accounts/fireworks/models/deepseek-r1";
            providerId: "openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks";
            reasoningEffort?: import("../../..").AgentReasoningEffort | undefined;
        }, {
            modelId: "gpt-3.5-turbo" | "gpt-4-turbo" | "gpt-4o" | "gpt-4o-2024-08-06" | "gpt-4o-mini" | "o1" | "o1-mini" | "o3-mini" | "claude-3-opus-20240229" | "claude-3-5-sonnet-20240620" | "claude-3-5-sonnet-20241022" | "claude-3-7-sonnet-20250219" | "claude-3-haiku-20240307" | "claude-3-5-haiku-20241022" | "claude-2.1" | "claude-instant-1.2" | "mistral-large-latest" | "mistral-medium" | "mistral-small-latest" | "codestral-latest" | "gemini-1.5-pro-latest" | "gemini-1.5-flash-latest" | "gemini-2.0-flash-exp" | "gemini-2.0-flash-thinking-exp-01-21" | "gemini-2.0-flash" | "gemini-2.0-flash-lite-preview-02-05" | "gemini-2.0-pro-exp-02-05" | "meta-llama/Llama-3.3-70B-Instruct-Turbo" | "Qwen/Qwen2.5-Coder-32B-Instruct" | "Qwen/QwQ-32B-Preview" | "Qwen/Qwen2-72B-Instruct" | "deepseek-ai/DeepSeek-V3" | "deepseek-ai/DeepSeek-R1" | "deepseek-chat" | "deepseek-reasoner" | "accounts/fireworks/models/deepseek-r1";
            providerId: "openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks";
            reasoningEffort?: import("../../..").AgentReasoningEffort | undefined;
        }, unknown>]>;
        actions: t.ArrayC<t.IntersectionC<[t.UnionC<[t.TypeC<{
            type: t.LiteralC<"retrieval_configuration">;
            query: t.UnionC<[t.LiteralC<"auto">, t.LiteralC<"none">]>;
            relativeTimeFrame: t.UnionC<[t.LiteralC<"auto">, t.LiteralC<"none">, t.TypeC<{
                duration: t.NumberC;
                unit: t.Type<"hour" | "day" | "week" | "month" | "year", "hour" | "day" | "week" | "month" | "year", unknown>;
            }>]>;
            topK: t.UnionC<[t.NumberC, t.LiteralC<"auto">]>;
            dataSources: t.ArrayC<t.TypeC<{
                dataSourceViewId: t.StringC;
                workspaceId: t.StringC;
                filter: t.IntersectionC<[t.TypeC<{
                    parents: t.UnionC<[t.TypeC<{
                        in: t.ArrayC<t.StringC>;
                        not: t.ArrayC<t.StringC>;
                    }>, t.NullC]>;
                }>, t.PartialC<{
                    tags: t.UnionC<[t.TypeC<{
                        in: t.ArrayC<t.StringC>;
                        not: t.ArrayC<t.StringC>;
                        mode: t.UnionC<[t.LiteralC<"custom">, t.LiteralC<"auto">]>;
                    }>, t.NullC]>;
                }>]>;
            }>>;
        }>, t.TypeC<{
            type: t.LiteralC<"dust_app_run_configuration">;
            appWorkspaceId: t.StringC;
            appId: t.StringC;
        }>, t.TypeC<{
            type: t.LiteralC<"tables_query_configuration">;
            tables: t.ArrayC<t.TypeC<{
                dataSourceViewId: t.StringC;
                tableId: t.StringC;
                workspaceId: t.StringC;
            }>>;
        }>, t.TypeC<{
            type: t.LiteralC<"process_configuration">;
            dataSources: t.ArrayC<t.TypeC<{
                dataSourceViewId: t.StringC;
                workspaceId: t.StringC;
                filter: t.IntersectionC<[t.TypeC<{
                    parents: t.UnionC<[t.TypeC<{
                        in: t.ArrayC<t.StringC>;
                        not: t.ArrayC<t.StringC>;
                    }>, t.NullC]>;
                }>, t.PartialC<{
                    tags: t.UnionC<[t.TypeC<{
                        in: t.ArrayC<t.StringC>;
                        not: t.ArrayC<t.StringC>;
                        mode: t.UnionC<[t.LiteralC<"custom">, t.LiteralC<"auto">]>;
                    }>, t.NullC]>;
                }>]>;
            }>>;
            relativeTimeFrame: t.UnionC<[t.LiteralC<"auto">, t.LiteralC<"none">, t.TypeC<{
                duration: t.NumberC;
                unit: t.Type<"hour" | "day" | "week" | "month" | "year", "hour" | "day" | "week" | "month" | "year", unknown>;
            }>]>;
            schema: t.ArrayC<t.TypeC<{
                name: t.StringC;
                type: t.UnionC<[t.LiteralC<"string">, t.LiteralC<"number">, t.LiteralC<"boolean">]>;
                description: t.StringC;
            }>>;
        }>, t.TypeC<{
            type: t.LiteralC<"websearch_configuration">;
        }>, t.TypeC<{
            type: t.LiteralC<"browse_configuration">;
        }>, t.TypeC<{
            type: t.LiteralC<"reasoning_configuration">;
            modelId: t.Type<"gpt-3.5-turbo" | "gpt-4-turbo" | "gpt-4o" | "gpt-4o-2024-08-06" | "gpt-4o-mini" | "o1" | "o1-mini" | "o3-mini" | "claude-3-opus-20240229" | "claude-3-5-sonnet-20240620" | "claude-3-5-sonnet-20241022" | "claude-3-7-sonnet-20250219" | "claude-3-haiku-20240307" | "claude-3-5-haiku-20241022" | "claude-2.1" | "claude-instant-1.2" | "mistral-large-latest" | "mistral-medium" | "mistral-small-latest" | "codestral-latest" | "gemini-1.5-pro-latest" | "gemini-1.5-flash-latest" | "gemini-2.0-flash-exp" | "gemini-2.0-flash-thinking-exp-01-21" | "gemini-2.0-flash" | "gemini-2.0-flash-lite-preview-02-05" | "gemini-2.0-pro-exp-02-05" | "meta-llama/Llama-3.3-70B-Instruct-Turbo" | "Qwen/Qwen2.5-Coder-32B-Instruct" | "Qwen/QwQ-32B-Preview" | "Qwen/Qwen2-72B-Instruct" | "deepseek-ai/DeepSeek-V3" | "deepseek-ai/DeepSeek-R1" | "deepseek-chat" | "deepseek-reasoner" | "accounts/fireworks/models/deepseek-r1", "gpt-3.5-turbo" | "gpt-4-turbo" | "gpt-4o" | "gpt-4o-2024-08-06" | "gpt-4o-mini" | "o1" | "o1-mini" | "o3-mini" | "claude-3-opus-20240229" | "claude-3-5-sonnet-20240620" | "claude-3-5-sonnet-20241022" | "claude-3-7-sonnet-20250219" | "claude-3-haiku-20240307" | "claude-3-5-haiku-20241022" | "claude-2.1" | "claude-instant-1.2" | "mistral-large-latest" | "mistral-medium" | "mistral-small-latest" | "codestral-latest" | "gemini-1.5-pro-latest" | "gemini-1.5-flash-latest" | "gemini-2.0-flash-exp" | "gemini-2.0-flash-thinking-exp-01-21" | "gemini-2.0-flash" | "gemini-2.0-flash-lite-preview-02-05" | "gemini-2.0-pro-exp-02-05" | "meta-llama/Llama-3.3-70B-Instruct-Turbo" | "Qwen/Qwen2.5-Coder-32B-Instruct" | "Qwen/QwQ-32B-Preview" | "Qwen/Qwen2-72B-Instruct" | "deepseek-ai/DeepSeek-V3" | "deepseek-ai/DeepSeek-R1" | "deepseek-chat" | "deepseek-reasoner" | "accounts/fireworks/models/deepseek-r1", unknown>;
            providerId: t.Type<"openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks", "openai" | "anthropic" | "mistral" | "google_ai_studio" | "togetherai" | "deepseek" | "fireworks", unknown>;
            temperature: t.UnionC<[t.NumberC, t.NullC]>;
            reasoningEffort: t.UnionC<[t.Type<"low" | "medium" | "high", "low" | "medium" | "high", unknown>, t.NullC]>;
        }>]>, t.TypeC<{
            name: t.StringC;
            description: t.UnionC<[t.StringC, t.NullC]>;
        }>]>>;
        templateId: t.UnionC<[t.StringC, t.NullC, t.UndefinedC]>;
        maxStepsPerRun: t.UnionC<[t.NumberC, t.UndefinedC]>;
        visualizationEnabled: t.BooleanC;
    }>;
}>;
export type PostOrPatchAgentConfigurationRequestBody = t.TypeOf<typeof PostOrPatchAgentConfigurationRequestBodySchema>;
//# sourceMappingURL=agent_configuration.d.ts.map