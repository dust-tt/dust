import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type {
  ModelConversationTypeMultiActions,
  ModelProviderIdType,
} from "@app/types";

export type TestConfig = LLMParameters & { provider: ModelProviderIdType };

export type ResponseChecker =
  | {
      type: "text_contains";
      substring: string;
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
