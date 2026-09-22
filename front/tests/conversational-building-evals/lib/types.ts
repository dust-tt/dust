import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { Authenticator } from "@app/lib/auth";
import type {
  ModelIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration";

/** A custom skill to create in the scenario's workspace before the run. */
export interface SeedSkill {
  // Scenario-local handle: skill sIds are assigned by the database at seed time, so scenarios
  // and assertions refer to skills by key.
  key: string;
  name: string;
  agentFacingDescription: string;
  userFacingDescription?: string;
  // Markdown, converted to block-structured HTML (with data-block-id) at seed time.
  instructions: string;
  // Defaults to the factory default.
  availability?: SkillAvailability;
}

/** A regular (non-admin) member to create in the scenario's workspace before the run. */
export interface SeedMember {
  key: string;
  firstName: string;
  lastName: string;
}

/** A remote MCP server (and its view in the global space) the agent can reference inline. */
export interface SeedTool {
  key: string;
  name: string;
  description: string;
  functions: Array<{ name: string; description: string }>;
}

/** A document of a seeded knowledge source, returned by `search_knowledge` for any query. */
export interface SeedKnowledgeDocument {
  key: string;
  title: string;
  text: string;
}

/** A folder data source (and its view in the global space) holding the documents. */
export interface SeedKnowledge {
  name: string;
  documents: SeedKnowledgeDocument[];
}

/** Everything the scenario's workspace is seeded with. Tools then run for real against it. */
export interface WorkspaceSeed {
  skills: SeedSkill[];
  members?: SeedMember[];
  tools?: SeedTool[];
  knowledge?: SeedKnowledge[];
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export type SkillUpdateEditKind =
  | "instructionEdits"
  | "agentFacingDescriptionEdit";

/**
 * What the run must end with. The "final" tool call is the last non-exploratory call of the run:
 * exploratory calls (listing / describing entities) never count.
 */
export type FinalToolCallAssertion =
  | {
      type: "suggestSkillUpdate";
      skillKey: string;
      // Which parts of the suggestion must be present. Defaults to at least one of them.
      edits?: SkillUpdateEditKind[];
      // Inline references the instruction edits must carry: `<tool id=.../>` tags for the seeded
      // tools, and `<knowledge .../>` tags matching the seeded documents attribute for attribute.
      references?: { toolKeys?: string[]; knowledgeKeys?: string[] };
    }
  | {
      type: "suggestSkillEditors";
      skillKey: string;
      // Members (by seed key) that must appear in `addUserIds`.
      addMemberKeys?: string[];
    }
  | { type: "suggestSkillDeletion"; skillKey: string }
  | { type: "suggestSkillName"; skillKey: string }
  | {
      type: "suggestSkillAvailability";
      skillKey: string;
      availability?: SkillAvailability;
    }
  | { type: "suggestSkillUserFacingDescription"; skillKey: string }
  | { type: "suggestAgentCreation" };

interface BaseTestCase {
  scenarioId: string;
  workspaceSeed: WorkspaceSeed;
  expectedFinalToolCall: FinalToolCallAssertion;
  // Scenario-specific criteria only: the judge prompt already carries the generic checklist.
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

/** What a `<knowledge>` tag must carry to point at a seeded document. */
export interface SeededKnowledgeNode {
  nodeId: string;
  title: string;
  spaceId: string;
  dataSourceViewId: string;
}

/** The scenario's seeded workspace: an admin user's authenticator and the created entity ids. */
export interface SeededScenario {
  auth: Authenticator;
  skillIdsByKey: Map<string, string>;
  memberIdsByKey: Map<string, string>;
  // MCP server view ids, which is what `<tool id=.../>` references.
  toolIdsByKey: Map<string, string>;
  knowledgeByKey: Map<string, SeededKnowledgeNode>;
}

/** The agent under test: the Dust global agent with the conversational-building skill enabled. */
export interface BuildingAgentConfig {
  agentId: string;
  instructions: string;
  // The `<dust_system>` message injecting the enabled skill instructions, as rendered in production.
  skillInstructionsMessage: string;
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

export interface ExecutionResult {
  responseText: string;
  toolCalls: ToolCall[];
  finalToolCall: ToolCall | null;
  modelTimeMs: number;
}

export interface EvalResult {
  testCase: CategorizedTestCase;
  execution: ExecutionResult;
  judgeResult: JudgeResult;
  passed: boolean;
}
