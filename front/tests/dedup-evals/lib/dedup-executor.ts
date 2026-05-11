import type { Authenticator } from "@app/lib/auth";
import {
  type DeduplicateCandidate,
  runDeduplicationLLMCall,
} from "@app/lib/project_task/deduplicate_candidates";
import type { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import logger from "@app/logger/logger";
import { MODEL_ID } from "@app/tests/dedup-evals/lib/config";
import type {
  DedupExecutionResult,
  DedupTestCase,
} from "@app/tests/dedup-evals/lib/types";
import SUPPORTED_MODEL_CONFIGS from "@app/types/assistant/models/models";

/**
 * Build a lightweight mock that satisfies the fields runDeduplicationLLMCall
 * accesses on ProjectTaskResource: `.sId` and `.text`.
 */
function buildMockExistingTodos(
  testCase: DedupTestCase
): ProjectTaskResource[] {
  return testCase.existingTodos.map(
    (t) =>
      ({
        sId: t.sId,
        text: t.text,
      }) as unknown as ProjectTaskResource
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

  const llmGroups = await runDeduplicationLLMCall(auth, {
    localLogger: logger,
    runId: "eval-run",
    model,
    candidates,
    existingTasks: existingTodos,
  });

  // Current eval assertions only cover candidate→existing matches. The LLM
  // now returns a partition over [...existingTodos, ...candidates]; project
  // each group that contains ≥1 existing down to "candidate idx → first
  // existing sId", dropping intra-batch follower info. Adding assertion
  // types for intra-batch dedup is tracked separately.
  const existingCount = existingTodos.length;
  const matchMap = new Map<number, string>();
  const seen = new Set<number>();
  for (const group of llmGroups) {
    let winnerSId: string | null = null;
    const candidateIdxs: number[] = [];
    for (const idx of group) {
      if (
        idx < 0 ||
        idx >= existingCount + candidates.length ||
        seen.has(idx)
      ) {
        continue;
      }
      seen.add(idx);
      if (idx < existingCount) {
        if (winnerSId === null) {
          winnerSId = existingTodos[idx].sId;
        }
      } else {
        candidateIdxs.push(idx - existingCount);
      }
    }
    if (winnerSId !== null) {
      for (const candidateIdx of candidateIdxs) {
        matchMap.set(candidateIdx, winnerSId);
      }
    }
  }

  return { matchMap };
}
