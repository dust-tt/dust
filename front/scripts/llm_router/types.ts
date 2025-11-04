import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type {
  ModelConversationTypeMultiActions,
  ModelIdType,
  ModelProviderIdType,
} from "@app/types";
import { GPT_5_MODEL_ID } from "@app/types";

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

export const PERMISSIVE_TEST_CONFIGS = [
  {
    temperature: 0.5,
    reasoningEffort: "none",
  },
  {
    temperature: 1,
    reasoningEffort: "light",
  },
  {
    temperature: 0.5,
    reasoningEffort: "medium",
  },
  {
    temperature: 1,
    reasoningEffort: "high",
  },
] as const;

export const OPENAI_MODEL_IDS_TO_TEST: ModelIdType[] = [GPT_5_MODEL_ID];
