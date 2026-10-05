import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  EditAgentSuggestion,
  EditSkillSuggestion,
} from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationType } from "@app/types/assistant/conversation";
import type {
  ModelIdType,
  ModelProviderIdType,
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
  // Markdown, converted to block-structured HTML (with data-block-id) at seed time. Cite a seeded
  // tool inline as `{{tool:<key>}}`: the skill is then equipped with it.
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

/** An agent to create in the scenario's workspace before the run. */
export interface SeedAgent {
  key: string;
  name: string;
  description: string;
  // Block-structured HTML with hand-picked `data-block-id`s, so scenarios can assert on which
  // blocks an edit targets. Wrap in the `instructions-root` div, as the editor stores it.
  instructionsHtml: string;
  // Defaults to the factory's model when omitted.
  model?: { providerId: ModelProviderIdType; modelId: ModelIdType };
  // Seeded tools (by key) the agent is equipped with.
  toolKeys?: string[];
}

/** Everything the scenario's workspace is seeded with. Tools then run for real against it. */
export interface WorkspaceSeed {
  skills: SeedSkill[];
  members?: SeedMember[];
  tools?: SeedTool[];
  knowledge?: SeedKnowledge[];
  agents?: SeedAgent[];
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export type SkillUpdateEditKind = keyof Pick<
  EditSkillSuggestion,
  "instructionEdits" | "agentFacingDescription"
>;

/**
 * A suggestion the run must record: its target, and the fields it must carry with these exact
 * values. Fields not listed are not checked.
 */
export type ExpectedSuggestion =
  | {
      kind: "edit_skill";
      skillKey: string;
      fields: Partial<Omit<EditSkillSuggestion, "kind" | "skillId">>;
    }
  | {
      kind: "edit_agent";
      agentKey: string;
      fields: Partial<Omit<EditAgentSuggestion, "kind" | "agentId">>;
    };

/**
 * The change the run must end with. The "final" tool call is the last non-exploratory call of the
 * run, which must be a `suggest` call carrying this change: exploratory calls (listing / describing
 * entities) never count. `separateSuggestions` checks every `suggest` call of the run instead,
 * since the change spans several calls.
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
  | { type: "suggestAgentDeletion"; agentKey: string }
  | { type: "suggestSkillName"; skillKey: string }
  | {
      type: "separateSuggestions";
      suggestions: ExpectedSuggestion[];
    }
  | {
      type: "suggestSkillAvailability";
      skillKey: string;
      availability?: SkillAvailability;
    }
  | { type: "suggestSkillUserFacingDescription"; skillKey: string }
  | { type: "suggestAgentCreation" }
  | { type: "suggestSkillCreation" }
  | {
      type: "suggestSubAgentByRef";
      // The seeded agent that must get the created agent as a sub-agent, through its ref.
      parentAgentKey: string;
      // How many created agents it must get. Defaults to 1.
      subAgentCount?: number;
    }
  | {
      type: "suggestAgentSkillByRef";
      // The seeded agent that must get the created skill. Without it, the run must create the
      // agent too and give it the skill.
      agentKey?: string;
    }
  | {
      type: "suggestSkillCitingNewSkill";
      // The seeded skill whose instruction edits must cite the created skill. Without it, one
      // created skill must cite another one.
      skillKey?: string;
    }
  | {
      // The run must record no suggestion, e.g. because it has to ask the user first, and must have
      // successfully called each of these (prefixed) tools.
      type: "noSuggestion";
      requiredToolNames: string[];
    }
  | {
      // Every skill and agent using `fromToolKey` must be edited, and nothing else. Checks every
      // `suggest` call of the run: the edits can be separate or batched. Agent edits must swap the
      // tools; skill edits must edit the instructions, what they change is left to the judge.
      type: "suggestToolReplacement";
      fromToolKey: string;
      toToolKey: string;
      skillKeys: string[];
      agentKeys: string[];
    }
  | {
      type: "suggestAgentInstructionsChange";
      agentKey: string;
      // The edit must target one of these block ids (from the seeded HTML). Guards against a
      // rewrite of the root or of an unrelated block when the change fits in one block.
      allowedTargetBlockIds?: string[];
    }
  | {
      type: "suggestAgentModelChange";
      agentKey: string;
      modelId: ModelIdType;
    }
  | {
      type: "suggestAgentStructuredOutput";
      agentKey: string;
      // Each pattern must match the name of a required top-level property of the schema, so the
      // scenario does not depend on the exact names the model picks (e.g. `zip_code`, `zipcode`).
      requiredProperties: RegExp[];
    };

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
  agentIdsByKey: Map<string, string>;
  // The conversation the run happens in: `suggest` records it as the source of its batch.
  conversation: ConversationType;
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

/** A tool call of the run, with whether the tool rejected it (in which case it had no effect). */
export interface ExecutedToolCall extends ToolCall {
  isError: boolean;
}

export interface JudgeResult {
  finalScore: number;
  scores: number[];
  reasoning: string;
}

export interface ExecutionResult {
  responseText: string;
  toolCalls: ExecutedToolCall[];
  // The same calls grouped by model round: calls of one round were issued in parallel.
  toolCallRounds: ExecutedToolCall[][];
  finalToolCall: ToolCall | null;
  modelTimeMs: number;
}

export interface EvalResult {
  testCase: CategorizedTestCase;
  execution: ExecutionResult;
  judgeResult: JudgeResult;
  passed: boolean;
}
