import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { LLMErrorInfo } from "@app/lib/api/llm/types/errors";
import type { SystemPromptSections } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMessageContentParser } from "@app/lib/llms/agent_message_content_parser";
import type {
  AgentFunctionCallContentType,
  AgentProviderPassthroughContentType,
  AgentReasoningContentType,
  AgentTextContentType,
} from "@app/types/assistant/agent_message_content";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type {
  AgentMessageType,
  ConversationType,
  ConversationWithoutContentType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import type { Ok, Result } from "@app/types/shared/result";

export type Output = {
  actions: Array<{
    functionCallId: string;
    name: string | null;
  }>;
  generation: string | null;
  contents: Array<
    | AgentTextContentType
    | AgentFunctionCallContentType
    | AgentReasoningContentType
    | AgentProviderPassthroughContentType
  >;
};

export type GetOutputRequestParams = {
  modelConversationRes: Ok<{
    modelConversation: ModelConversationTypeMultiActions;
    tokensUsed: number;
  }>;
  conversation: ConversationType;
  // When true, the Anthropic client defers non-eager tools behind tool search.
  // Provider-agnostic signal: clients without tool-search support ignore it.
  toolSearchEnabled: boolean;
  // When true, the tools are sent but the model is forbidden from calling them
  // (tool choice "none"). Set on the last step to force the final generation.
  disableToolUse: boolean;
  userMessage: UserMessageType;
  specifications: AgentActionSpecification[];
  flushParserTokens: () => Promise<void>;
  contentParser: AgentMessageContentParser;
  step: number;
  agentConfiguration: AgentLoopExecutionData["agentConfiguration"];
  agentMessage: AgentLoopExecutionData["agentMessage"];
  model: ModelConfigurationType;
  activityTimeoutDeadlineMs: number;
  publishAgentError: (error: {
    code: string;
    message: string;
    metadata: Record<string, string | number | boolean> | null;
  }) => Promise<void>;
  prompt: SystemPromptSections;
  updateResourceAndPublishEvent: (
    auth: Authenticator,
    {
      event,
      agentMessage,
      conversation,
      step,
      modelInteractionDurationMs,
    }: {
      event: AgentMessageEvents;
      agentMessage: AgentMessageType;
      conversation: ConversationWithoutContentType;
      step: number;
      modelInteractionDurationMs?: number;
    }
  ) => Promise<void>;
};

export type GetOutputResponse = Result<
  {
    output: Output;
    dustRunId: string;
    nativeChainOfThought: string;
    timeToFirstEvent?: number;
    stopReason?: string;
  },
  | { type: "shouldRetryMessage"; content: LLMErrorInfo }
  | { type: "shouldReturnNull" }
>;
