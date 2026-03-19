import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import { formatConversationForShrinkWrap } from "@app/lib/api/assistant/conversation/shrink_wrap";
import {
  formatAvailableSkills,
  formatAvailableTools,
} from "@app/lib/api/assistant/global_agents/sidekick_context";
import type {
  AvailableSkill,
  AvailableTool,
} from "@app/lib/api/assistant/workspace_capabilities";
import type {
  AgentInstructionsSuggestionType,
  AgentSkillsSuggestionType,
  AgentToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";

// Reuse the suggestion union from the real code.
export type ReinforcedSuggestionType =
  | AgentInstructionsSuggestionType
  | AgentToolsSuggestionType
  | AgentSkillsSuggestionType;

export interface WorkspaceContext {
  tools: AvailableTool[];
  skills: AvailableSkill[];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "_");
}

/** Create a mock AvailableTool. sId defaults to `mcp_<slugified name>`. */
export function mockTool(
  name: string,
  description: string,
  sId?: string
): AvailableTool {
  return {
    sId: sId ?? `mcp_${slugify(name)}`,
    name,
    description,
    serverType: "remote",
    availability: "manual",
  };
}

/** Create a mock AvailableSkill. sId defaults to `skill_<slugified name>`. */
export function mockSkill(
  name: string,
  description: string,
  sId?: string
): AvailableSkill {
  return {
    sId: sId ?? `skill_${slugify(name)}`,
    name,
    userFacingDescription: description,
    agentFacingDescription: description,
    icon: null,
    toolSIds: [],
  };
}

/** Build the tools & skills context string using the real formatters. */
export function buildToolsAndSkillsContextFromWorkspace(
  ctx: WorkspaceContext
): string {
  return [formatAvailableSkills(ctx.skills), formatAvailableTools(ctx.tools)]
    .filter(Boolean)
    .join("\n\n");
}

export interface MockFeedback {
  direction: AgentMessageFeedbackDirection;
  comment?: string;
}

export interface MockConversationMessage {
  role: "user" | "agent";
  content: string;
  feedback?: MockFeedback;
}

/**
 * Build a shrink-wrapped conversation text from a compact message list,
 * using the real `formatConversationForShrinkWrap`.
 */
export function buildConversationText(
  messages: MockConversationMessage[],
  agentConfigSId: string = "agent-under-test"
): string {
  const feedbackByMessageId = new Map<
    string,
    { thumbDirection: AgentMessageFeedbackDirection; content: string | null }[]
  >();

  const shrinkMessages = messages.map((msg, i) => {
    const sId = `msg_${i}`;
    const created = 1700000000 + i * 100;

    if (msg.role === "user") {
      return {
        type: "user_message" as const,
        sId,
        created,
        content: msg.content,
        context: { username: "user" },
        mentions: [{ configurationId: agentConfigSId }],
      };
    }

    if (msg.feedback) {
      feedbackByMessageId.set(sId, [
        {
          thumbDirection: msg.feedback.direction,
          content: msg.feedback.comment ?? null,
        },
      ]);
    }

    return {
      type: "agent_message" as const,
      sId,
      created,
      content: msg.content,
      status: "succeeded",
      configuration: { sId: agentConfigSId, name: "Agent" },
      actions: [],
      parentAgentMessageId: null,
    };
  });

  return formatConversationForShrinkWrap(
    { sId: "conv_eval", title: "Eval conversation", messages: shrinkMessages },
    { feedbackByMessageId }
  );
}

export interface MockAgentConfig {
  name: string;
  description?: string;
  instructionsHtml?: string;
  /** Tools already configured on the agent (name + sId). */
  tools?: Array<{ name: string; sId: string }>;
  /** Skills already configured on the agent (name + sId). */
  skills?: Array<{ name: string; sId: string }>;
}

interface BaseTestCase {
  scenarioId: string;
  expectedToolCalls?: ToolCallAssertion[];
  judgeCriteria: string;
  agentConfig: MockAgentConfig;
  workspaceContext: WorkspaceContext;
}

export interface AnalysisTestCase extends BaseTestCase {
  type: "analysis";
  conversation: MockConversationMessage[];
}

export interface AggregationTestCase extends BaseTestCase {
  type: "aggregation";
  syntheticSuggestions: ReinforcedSuggestionType[];
  existingSuggestions?: {
    pending: ReinforcedSuggestionType[];
    rejected: ReinforcedSuggestionType[];
  };
}

export type TestCase = AnalysisTestCase | AggregationTestCase;

export function isAnalysisTestCase(tc: TestCase): tc is AnalysisTestCase {
  return tc.type === "analysis";
}

export function isAggregationTestCase(tc: TestCase): tc is AggregationTestCase {
  return tc.type === "aggregation";
}

/** Returns a short description of the test case input for display/logging. */
export function getTestCaseInputForDisplay(testCase: TestCase): string {
  switch (testCase.type) {
    case "analysis": {
      const convSummary = testCase.conversation
        .map((m) => `[${m.role}]: ${m.content.slice(0, 100)}`)
        .join("\n");
      return [
        `Agent: ${testCase.agentConfig.name}`,
        testCase.agentConfig.description
          ? `Description: ${testCase.agentConfig.description}`
          : "",
        `Conversation:\n${convSummary}`,
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "aggregation":
      return [
        `Agent: ${testCase.agentConfig.name}`,
        `Synthetic suggestions: ${testCase.syntheticSuggestions.length}`,
      ].join("\n");
  }
}

/** TestCase with category assigned by suite loader. */
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

export type ToolCallAssertion =
  | { type: "toolSuggestion"; toolId: string }
  | { type: "skillSuggestion"; skillId: string }
  | { type: "promptSuggestion" }
  | { type: "noSuggestion" };

export function toolSuggestion(toolId: string): ToolCallAssertion {
  return { type: "toolSuggestion", toolId };
}

export function skillSuggestion(skillId: string): ToolCallAssertion {
  return { type: "skillSuggestion", skillId };
}

export function promptSuggestion(): ToolCallAssertion {
  return { type: "promptSuggestion" };
}

export function noSuggestion(): ToolCallAssertion {
  return { type: "noSuggestion" };
}

export interface JudgeResult {
  finalScore: number;
  scores: number[];
  reasoning: string;
}

export interface ExecutionResult {
  responseText: string;
  toolCalls: ToolCall[];
}
