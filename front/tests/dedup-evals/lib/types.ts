// ── Mock data types ─────────────────────────────────────────────────────────

export interface MockExistingTodo {
  sId: string;
  text: string;
}

export interface MockCandidate {
  itemId: string;
  text: string;
}

// ── Assertions ──────────────────────────────────────────────────────────────

export type DedupAssertion =
  | { type: "shouldMatchExisting"; candidateIndex: number; existingSId: string }
  | { type: "shouldBeNew"; candidateIndex: number };

/** Expects candidate at `candidateIndex` to be matched to `existingSId`. */
export function shouldMatchExisting(
  candidateIndex: number,
  existingSId: string
): DedupAssertion {
  return { type: "shouldMatchExisting", candidateIndex, existingSId };
}

/** Expects candidate at `candidateIndex` to have no match (genuinely new). */
export function shouldBeNew(candidateIndex: number): DedupAssertion {
  return { type: "shouldBeNew", candidateIndex };
}

// ── Test case ───────────────────────────────────────────────────────────────

export interface DedupTestCase {
  scenarioId: string;
  existingTodos: MockExistingTodo[];
  candidates: MockCandidate[];
  expectedMatches: DedupAssertion[];
  judgeCriteria: string;
}

/** TestCase with category name assigned by suite loader. */
export type CategorizedDedupTestCase = DedupTestCase & { suiteName: string };

export interface DedupTestSuite {
  name: string;
  description: string;
  testCases: DedupTestCase[];
}

// ── Execution result ────────────────────────────────────────────────────────

/** Result of one runDeduplicationLLMCall invocation. */
export interface DedupExecutionResult {
  /** Map from candidate index → matched existing sId (absent = new). */
  matchMap: Map<number, string>;
}

// ── Judge ───────────────────────────────────────────────────────────────────

export interface JudgeResult {
  finalScore: number;
  scores: number[];
  reasoning: string;
}

// ── Display helpers ─────────────────────────────────────────────────────────

/** Returns a short description of the test case input for display/logging. */
export function getTestCaseInputForDisplay(testCase: DedupTestCase): string {
  const existingLines = testCase.existingTodos
    .map((t) => `  [${t.sId}] ${t.text}`)
    .join("\n");

  const candidateLines = testCase.candidates
    .map((c, i) => `  [${i}] ${c.text}`)
    .join("\n");

  return [
    `Existing TODOs:\n${existingLines || "  (none)"}`,
    `New candidates:\n${candidateLines}`,
  ].join("\n");
}

export function formatMatchMap(matchMap: Map<number, string>): string {
  if (matchMap.size === 0) {
    return "(no matches — all candidates are new)";
  }
  return [...matchMap.entries()]
    .map(([idx, sId]) => `candidate[${idx}] → ${sId}`)
    .join(", ");
}
