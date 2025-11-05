import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  ModelConversationTypeMultiActions,
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types";

export type TestConfig = {
  modelId: ModelIdType;
  temperature?: number | undefined;
  reasoningEffort?: ReasoningEffort | undefined;
  provider: ModelProviderIdType;
};

export type ResponseChecker =
  | {
      type: "text_contains";
      anyString: string[];
    }
  | {
      type: "has_tool_call";
      toolName: string;
      expectedArguments: string;
    }
  | null;

export interface TestConversation {
  id: string;
  name: string;
  systemPrompt: string;
  conversationActions: ModelConversationTypeMultiActions[];
  /** Array of response checkers aligned with the conversation actions */
  expectedInResponses: ResponseChecker[];
  specifications?: AgentActionSpecification[];
}

export interface RunnabletestConversation {
  name: string;
  run: (config: TestConfig) => Promise<void>;
}

export interface ConfigParams {
  temperature?: number;
  reasoningEffort?: ReasoningEffort;
}
