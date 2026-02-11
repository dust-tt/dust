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

export interface TestCase {
  scenarioId: string;
  userMessage: string;
  mockState: MockAgentState;
  expectedToolCalls?: string[];
  judgeCriteria: string;
}

/** TestCase with category assigned by suite loader */
export interface CategorizedTestCase extends TestCase {
  category: string;
}

export interface TestSuite {
  name: string;
  description: string;
  testCases: TestCase[];
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface CopilotConfig {
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

export interface CopilotExecutionResult {
  responseText: string;
  toolCalls: ToolCall[];
}

export interface EvalResult {
  testCase: CategorizedTestCase;
  responseText: string;
  toolCalls: ToolCall[];
  judgeResult: JudgeResult;
  passed: boolean;
}
