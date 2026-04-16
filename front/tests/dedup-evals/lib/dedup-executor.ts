import type { Authenticator } from "@app/lib/auth";
import {
  type DeduplicateCandidate,
  runDeduplicationLLMCall,
} from "@app/lib/project_todo/deduplicate_candidates";
import type { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { MODEL_ID } from "@app/tests/dedup-evals/lib/config";
import type {
  DedupExecutionResult,
  DedupTestCase,
} from "@app/tests/dedup-evals/lib/types";
import SUPPORTED_MODEL_CONFIGS from "@app/types/assistant/models/models";

/**
 * Build a lightweight mock that satisfies the fields runDeduplicationLLMCall
 * accesses on ProjectTodoResource: `.sId` and `.text`.
 */
function buildMockExistingTodos(
  testCase: DedupTestCase
): ProjectTodoResource[] {
  return testCase.existingTodos.map(
    (t) =>
      ({
        sId: t.sId,
        text: t.text,
      }) as unknown as ProjectTodoResource
  );
}

function buildCandidates(testCase: DedupTestCase): DeduplicateCandidate[] {
  return testCase.candidates.map((c) => ({
    itemId: c.itemId,
    // userId is not used in the prompt — just needs to be a valid ModelId.
    userId: 1 as unknown as number,
    text: c.text,
    category: "to_do",
  }));
}

/**
 * Execute a single dedup eval scenario by calling the real
 * `runDeduplicationLLMCall` with mock data.
 */
export async function executeDedup(
  auth: Authenticator,
  testCase: DedupTestCase
): Promise<DedupExecutionResult> {
  const model = SUPPORTED_MODEL_CONFIGS.find((m) => m.modelId === MODEL_ID);
  if (!model) {
    throw new Error(`Model "${MODEL_ID}" not found in SUPPORTED_MODEL_CONFIGS`);
  }
  const existingTodos = buildMockExistingTodos(testCase);
  const candidates = buildCandidates(testCase);

  const matchMap = await runDeduplicationLLMCall(auth, {
    model,
    candidates,
    existingTodos,
  });

  return { matchMap };
}
