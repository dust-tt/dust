import type { ExtractionResult } from "@app/lib/project_todo/analyze_document/types";
import type { ProjectTodoSourceType } from "@app/types/project_todo";
import type {
  TodoVersionedActionItem,
  TodoVersionedKeyDecision,
  TodoVersionedNotableFact,
} from "@app/types/takeaways";

// ── Mock data types ─────────────────────────────────────────────────────────

export interface MockProjectMember {
  sId: string;
  fullName: string;
  email: string;
}

export interface MockDocument {
  id: string;
  title: string;
  type: ProjectTodoSourceType;
  text: string;
  uri: string;
}

export interface MockPreviousVersion {
  actionItems: TodoVersionedActionItem[];
  notableFacts: TodoVersionedNotableFact[];
  keyDecisions: TodoVersionedKeyDecision[];
}

// ── Assertions ──────────────────────────────────────────────────────────────

export type TakeawayAssertion =
  | {
      type: "shouldExtractActionItem";
      descriptionContains: string;
      assigneeUserId?: string;
      status?: "open" | "done";
    }
  | { type: "shouldNotExtractActionItem"; descriptionContains: string }
  | {
      type: "shouldExtractNotableFact";
      descriptionContains: string;
    }
  | {
      type: "shouldExtractKeyDecision";
      descriptionContains: string;
      status?: "decided" | "open";
    }
  | { type: "minActionItems"; count: number }
  | { type: "maxActionItems"; count: number }
  | {
      type: "shouldPreserveSId";
      category: "actionItem" | "notableFact" | "keyDecision";
      sId: string;
    }
  | { type: "shouldNotAssignTo"; userId: string };

// ── Assertion constructors ──────────────────────────────────────────────────

export function shouldExtractActionItem(
  descriptionContains: string,
  opts?: { assigneeUserId?: string; status?: "open" | "done" }
): TakeawayAssertion {
  return {
    type: "shouldExtractActionItem",
    descriptionContains,
    ...opts,
  };
}

export function shouldNotExtractActionItem(
  descriptionContains: string
): TakeawayAssertion {
  return { type: "shouldNotExtractActionItem", descriptionContains };
}

export function shouldExtractNotableFact(
  descriptionContains: string
): TakeawayAssertion {
  return { type: "shouldExtractNotableFact", descriptionContains };
}

export function shouldExtractKeyDecision(
  descriptionContains: string,
  opts?: { status?: "decided" | "open" }
): TakeawayAssertion {
  return {
    type: "shouldExtractKeyDecision",
    descriptionContains,
    ...opts,
  };
}

export function minActionItems(count: number): TakeawayAssertion {
  return { type: "minActionItems", count };
}

export function maxActionItems(count: number): TakeawayAssertion {
  return { type: "maxActionItems", count };
}

export function shouldPreserveSId(
  category: "actionItem" | "notableFact" | "keyDecision",
  sId: string
): TakeawayAssertion {
  return { type: "shouldPreserveSId", category, sId };
}

export function shouldNotAssignTo(userId: string): TakeawayAssertion {
  return { type: "shouldNotAssignTo", userId };
}

// ── Test case ───────────────────────────────────────────────────────────────

export interface TakeawayTestCase {
  scenarioId: string;
  document: MockDocument;
  members: MockProjectMember[];
  previousVersion?: MockPreviousVersion;
  expectedAssertions: TakeawayAssertion[];
  judgeCriteria: string;
}

/** TestCase with suite name assigned by suite loader. */
export type CategorizedTakeawayTestCase = TakeawayTestCase & {
  suiteName: string;
};

export interface TakeawayTestSuite {
  name: string;
  description: string;
  testCases: TakeawayTestCase[];
}

// ── Execution result ────────────────────────────────────────────────────────

/** Result of one takeaway extraction LLM call. */
export interface TakeawayExecutionResult {
  extraction: ExtractionResult | null;
  actionItems: TodoVersionedActionItem[];
  notableFacts: TodoVersionedNotableFact[];
  keyDecisions: TodoVersionedKeyDecision[];
}

// ── Display helpers ─────────────────────────────────────────────────────────

export interface JudgeResult {
  finalScore: number;
  scores: number[];
  reasoning: string;
}

/** Returns a short description of the test case input for display/logging. */
export function getTestCaseInputForDisplay(testCase: TakeawayTestCase): string {
  const memberLines = testCase.members
    .map((m) => `  - ${m.fullName} (${m.email}, id: ${m.sId})`)
    .join("\n");

  const docPreview =
    testCase.document.text.length > 500
      ? testCase.document.text.slice(0, 500) + "..."
      : testCase.document.text;

  return [
    `Document (type: ${testCase.document.type}):`,
    docPreview,
    `\nProject members:\n${memberLines || "  (none)"}`,
  ].join("\n");
}

export function formatExtractionResult(
  result: TakeawayExecutionResult
): string {
  const parts: string[] = [];

  if (result.actionItems.length > 0) {
    const items = result.actionItems
      .map(
        (a) =>
          `  - [${a.status}] ${a.shortDescription}${a.assigneeUserId ? ` (assignee: ${a.assigneeUserId})` : ""}`
      )
      .join("\n");
    parts.push(`Action items:\n${items}`);
  }

  if (result.notableFacts.length > 0) {
    const facts = result.notableFacts
      .map((f) => `  - ${f.shortDescription}`)
      .join("\n");
    parts.push(`Notable facts:\n${facts}`);
  }

  if (result.keyDecisions.length > 0) {
    const decisions = result.keyDecisions
      .map((d) => `  - [${d.status}] ${d.shortDescription}`)
      .join("\n");
    parts.push(`Key decisions:\n${decisions}`);
  }

  if (parts.length === 0) {
    return "(no takeaways extracted)";
  }
  return parts.join("\n");
}
