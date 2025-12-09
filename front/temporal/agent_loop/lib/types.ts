import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { AgentMessageContentParser } from "@app/lib/api/assistant/agent_message_content_parser";
import type { AgentMessageEvents } from "@app/lib/api/assistant/streaming/types";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMessageModel } from "@app/lib/models/agent/conversation";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  ConversationWithoutContentType,
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
  Ok,
  Result,
  UserMessageType,
} from "@app/types";
import type {
  AgentFunctionCallContentType,
  AgentReasoningContentType,
  AgentTextContentType,
} from "@app/types/assistant/agent_message_content";

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
  userMessage: UserMessageType;
  runConfig: any;
  specifications: AgentActionSpecification[];
  flushParserTokens: () => Promise<void>;
  contentParser: AgentMessageContentParser;
  agentMessageRow: AgentMessageModel;
  step: number;
  agentConfiguration: AgentConfigurationType;
  agentMessage: AgentMessageType;
  model: ModelConfigurationType;
  publishAgentError: (error: {
    code: string;
    message: string;
    metadata: Record<string, string | number | boolean> | null;
  }) => Promise<void>;
  prompt: string;
  updateResourceAndPublishEvent: (
    auth: Authenticator,
    {
      event,
      agentMessageRow,
      conversation,
      step,
      modelInteractionDurationMs,
    }: {
      event: AgentMessageEvents;
      agentMessageRow: AgentMessageModel;
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
  { type: "shouldRetryMessage"; message: string } | { type: "shouldReturnNull" }
>;
