import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  ModelIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";

export interface MockAgentState {
  name: string;
  description: string;
  instructions: string;
  scope?: string;
  model: {
    modelId: string;
    temperature?: number;
    reasoningEffort?: string | null;
  };
  tools: Array<{
    sId: string;
    name: string;
    description: string;
  }>;
  skills: Array<{
    sId: string;
    name: string;
    description: string;
  }>;
  maxStepsPerRun?: number;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface BaseTestCase {
  scenarioId: string;
  mockState: MockAgentState;
  expectedToolCalls?: string[];
  judgeCriteria: string;
}

export interface SimpleTestCase extends BaseTestCase {
  userMessage: string;
}

export interface TestCaseWithConversation extends BaseTestCase {
  conversation: ConversationMessage[];
}

export type TestCase = SimpleTestCase | TestCaseWithConversation;

export function isTestCaseWithConversation(
  testCase: TestCase
): testCase is TestCaseWithConversation {
  return "conversation" in testCase;
}

/** Returns the user message(s) as a single string for display/logging. */
export function getTestCaseUserMessageForDisplay(testCase: TestCase): string {
  if (isTestCaseWithConversation(testCase)) {
    return testCase.conversation
      .map((m) => `[${m.role}]: ${m.content}`)
      .join("\n\n");
  }
  return testCase.userMessage;
}

/** TestCase with category assigned by suite loader */
export type CategorizedTestCase = TestCase & { category: string };

export interface TestSuite {
  name: string;
  description: string;
  testCases: TestCase[];
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface SidekickConfig {
  instructions: string;
  model: {
    modelId: ModelIdType;
    temperature?: number;
    reasoningEffort?: ReasoningEffort;
  };
  tools: AgentActionSpecification[];
}

export interface JudgeResult {
  finalScore: number;
  scores: number[];
  reasoning: string;
}

export interface SidekickExecutionResult {
  responseText: string;
  toolCalls: ToolCall[];
  modelTimeMs: number;
}

export interface EvalResult {
  testCase: CategorizedTestCase;
  responseText: string;
  toolCalls: ToolCall[];
  judgeResult: JudgeResult;
  passed: boolean;
  sidekickModelTimeMs: number;
}
