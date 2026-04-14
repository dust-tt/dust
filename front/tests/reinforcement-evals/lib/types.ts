import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import {
  formatConversationForShrinkWrap,
  type ShrinkWrapAction,
} from "@app/lib/api/assistant/conversation/shrink_wrap";
import type { AvailableTool } from "@app/lib/api/assistant/workspace_capabilities";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";

export interface WorkspaceContext {
  tools: AvailableTool[];
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

export interface MockFeedback {
  direction: AgentMessageFeedbackDirection;
  comment?: string;
}

/** Lightweight action descriptor for mock conversations. */
export interface MockAction {
  functionCallName: string;
  status: "succeeded" | "failed";
  params?: Record<string, unknown>;
  output?: string | null;
}

export interface MockConversationMessage {
  role: "user" | "agent";
  content: string;
  feedback?: MockFeedback;
  actions?: MockAction[];
}

/**
 * Build a shrink-wrapped conversation text from a compact message list,
 * using the real `formatConversationForShrinkWrap`.
 */
export function buildConversationText(
  messages: MockConversationMessage[],
  agentConfigSId: string = "skill-under-test"
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

    const actions: ShrinkWrapAction[] = (msg.actions ?? []).map((a) => ({
      functionCallName: a.functionCallName,
      status: a.status,
      internalMCPServerName: null,
      params: a.params ?? {},
      output: a.output ?? null,
    }));

    return {
      type: "agent_message" as const,
      sId,
      created,
      content: msg.content,
      status: "succeeded",
      configuration: { sId: agentConfigSId, name: "Agent" },
      actions,
      parentAgentMessageId: null,
    };
  });

  return formatConversationForShrinkWrap(
    { sId: "conv_eval", title: "Eval conversation", messages: shrinkMessages },
    { feedbackByMessageId, includeActionDetails: true }
  );
}

export interface MockSkillConfig {
  name: string;
  sId: string;
  description?: string;
  instructions?: string;
  /** Tools already configured on the skill. */
  tools?: Array<{ name: string; sId: string }>;
}

interface BaseTestCase {
  scenarioId: string;
  expectedToolCalls?: ToolCallAssertion[];
  judgeCriteria: string;
  workspaceContext: WorkspaceContext;
}

export interface AnalysisTestCase extends BaseTestCase {
  type: "analysis";
  skillConfigs: MockSkillConfig[];
  conversation: MockConversationMessage[];
}

export interface AggregationTestCase extends BaseTestCase {
  type: "aggregation";
  skillConfig: MockSkillConfig;
  syntheticSuggestions: SkillSuggestionType[];
  existingSuggestions?: {
    pending: SkillSuggestionType[];
    rejected: SkillSuggestionType[];
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
      const skillNames = testCase.skillConfigs.map((s) => s.name).join(", ");
      const convSummary = testCase.conversation
        .map((m) => `[${m.role}]: ${m.content.slice(0, 100)}`)
        .join("\n");
      return [`Skills: ${skillNames}`, `Conversation:\n${convSummary}`]
        .filter(Boolean)
        .join("\n");
    }
    case "aggregation":
      return [
        `Skill: ${testCase.skillConfig.name}`,
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
  | { type: "editSkillWithInstructions"; skillId: string }
  | { type: "editSkillWithTool"; skillId: string; toolId: string }
  | { type: "editSkill"; skillId: string }
  | { type: "noSuggestion" };

/** Expects an edit_skill call with instructionEdits for the given skill. */
export function editSkillWithInstructions(skillId: string): ToolCallAssertion {
  return { type: "editSkillWithInstructions", skillId };
}

/** Expects an edit_skill call with a toolEdit for the given skill and tool. */
export function editSkillWithTool(
  skillId: string,
  toolId: string
): ToolCallAssertion {
  return { type: "editSkillWithTool", skillId, toolId };
}

/** Expects an edit_skill call for the given skill (any edit type). */
export function editSkill(skillId: string): ToolCallAssertion {
  return { type: "editSkill", skillId };
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
