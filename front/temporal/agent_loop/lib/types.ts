import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { AgentMessageContentParser } from "@app/lib/api/assistant/agent_message_content_parser";
import type { AgentMessage } from "@app/lib/models/assistant/conversation";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  ModelConfigurationType,
  ModelConversationTypeMultiActions,
  Ok,
  Result,
  TextContent,
  UserMessageType,
} from "@app/types";
import type {
  FunctionCallContent,
  ReasoningContent,
} from "@app/types/assistant/agent_message_content";

export type Output = {
  actions: Array<{
    functionCallId: string;
    name: string | null;
  }>;
  generation: string | null;
  contents: Array<TextContent | FunctionCallContent | ReasoningContent>;
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
  agentMessageRow: AgentMessage;
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
};

export type GetOutputResponse = Result<
  {
    output: Output;
    dustRunId: string;
    nativeChainOfThought: string;
  },
  { type: "shouldRetryMessage"; message: string } | { type: "shouldReturnNull" }
>;
