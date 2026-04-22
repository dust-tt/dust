import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import { renderConversationAsText } from "@app/lib/api/assistant/conversation/render_as_text";
import type { AvailableTool } from "@app/lib/api/assistant/workspace_capabilities";
import {
  mockAgentMessage,
  mockConversation,
  mockUserMessage,
} from "@app/tests/utils/conversation_test_factories";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";

export interface MockMcpToolInput {
  name: string;
  type: string;
  description?: string;
  /** Defaults to true if omitted. */
  required?: boolean;
}

export interface MockMcpTool {
  name: string;
  description: string;
  inputs?: MockMcpToolInput[];
}

export interface MockMcpDescription {
  sId: string;
  description: string;
  tools: MockMcpTool[];
}

export interface WorkspaceContext {
  tools: AvailableTool[];
  /** Optional MCP details returned when describe_mcp is called during eval. */
  mcpDescriptions?: MockMcpDescription[];
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
 * Build a conversation text from a compact message list using the real serializer
 * so the output format always stays in sync with production rendering.
 */
export function buildConversationText(
  messages: MockConversationMessage[],
  _agentConfigSId: string = "skill-under-test"
): string {
  return renderConversationAsText(
    mockConversation(
      messages.map((msg) =>
        msg.role === "user"
          ? mockUserMessage(msg.content)
          : mockAgentMessage({
              content: msg.content,
              actions: msg.actions,
              feedback: msg.feedback
                ? [
                    {
                      direction: msg.feedback.direction,
                      comment: msg.feedback.comment,
                    },
                  ]
                : undefined,
            })
      )
    ),
    { includeActions: true, includeActionDetails: true, includeFeedback: true }
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
  | {
      type: "editSkillWithInstructions";
      skillId: string;
      sourceSuggestionIds?: string[];
    }
  | {
      type: "editSkillWithTool";
      skillId: string;
      toolId: string;
      sourceSuggestionIds?: string[];
    }
  | { type: "editSkill"; skillId: string; sourceSuggestionIds?: string[] }
  | { type: "editSkillCallCount"; count: number }
  | { type: "editSkillCallsWithSources"; sourceSuggestionIdGroups: string[][] }
  | { type: "noSuggestion" }
  | { type: "calledDescribeMcp"; mcpId: string };

/** Expects an edit_skill call with instructionEdits for the given skill. */
export function editSkillWithInstructions(
  skillId: string,
  sourceSuggestionIds?: string[]
): ToolCallAssertion {
  return { type: "editSkillWithInstructions", skillId, sourceSuggestionIds };
}

/** Expects an edit_skill call with a toolEdit for the given skill and tool. */
export function editSkillWithTool(
  skillId: string,
  toolId: string,
  sourceSuggestionIds?: string[]
): ToolCallAssertion {
  return { type: "editSkillWithTool", skillId, toolId, sourceSuggestionIds };
}

/** Expects an edit_skill call for the given skill (any edit type). */
export function editSkill(
  skillId: string,
  sourceSuggestionIds?: string[]
): ToolCallAssertion {
  return { type: "editSkill", skillId, sourceSuggestionIds };
}

export function noSuggestion(): ToolCallAssertion {
  return { type: "noSuggestion" };
}

/** Expects exactly `count` edit_skill calls. */
export function editSkillCallCount(count: number): ToolCallAssertion {
  return { type: "editSkillCallCount", count };
}

/**
 * Expects one edit_skill call per group, where each call's sourceSuggestionIds
 * matches exactly one of the provided groups (order of calls doesn't matter).
 */
export function editSkillCallsWithSources(
  sourceSuggestionIdGroups: string[][]
): ToolCallAssertion {
  return { type: "editSkillCallsWithSources", sourceSuggestionIdGroups };
}

/** Expects describe_mcp to have been called with the given mcpId. */
export function calledDescribeMcp(mcpId: string): ToolCallAssertion {
  return { type: "calledDescribeMcp", mcpId };
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
