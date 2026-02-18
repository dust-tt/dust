import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { LLMErrorInfo } from "@app/lib/api/llm/types/errors";
import type { SystemPromptSections } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMessageContentParser } from "@app/lib/llms/agent_message_content_parser";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentFunctionCallContentType,
  AgentReasoningContentType,
  AgentTextContentType,
} from "@app/types/assistant/agent_message_content";
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
  >;
};

export type GetOutputRequestParams = {
  modelConversationRes: Ok<{
    modelConversation: ModelConversationTypeMultiActions;
    tokensUsed: number;
  }>;
  conversation: ConversationType;
  hasConditionalJITTools: boolean;
  userMessage: UserMessageType;
  specifications: AgentActionSpecification[];
  flushParserTokens: () => Promise<void>;
  contentParser: AgentMessageContentParser;
  step: number;
  agentConfiguration: AgentConfigurationType;
  agentMessage: AgentMessageType;
  model: ModelConfigurationType;
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
  },
  | { type: "shouldRetryMessage"; content: LLMErrorInfo }
  | { type: "shouldReturnNull" }
>;
