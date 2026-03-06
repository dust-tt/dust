import { callAgentEvaluator } from "@app/lib/butler/evaluators/call_agent";
import { createFrameEvaluator } from "@app/lib/butler/evaluators/create_frame";
import { renameTitleEvaluator } from "@app/lib/butler/evaluators/rename_title";
import type { ButlerEvaluator } from "@app/lib/butler/evaluators/types";

// All registered evaluators.
const ALL_EVALUATORS: ButlerEvaluator[] = [
  renameTitleEvaluator,
  callAgentEvaluator,
  createFrameEvaluator,
];

// Weighted rotation sequence: agent gets ~50%, frame ~30%, rename ~20%.
// Each pass picks one evaluator from this cycle based on passIndex.
const ROTATION_SEQUENCE: ButlerEvaluator[] = [
  callAgentEvaluator, // 0
  createFrameEvaluator, // 1
  callAgentEvaluator, // 2
  renameTitleEvaluator, // 3
  createFrameEvaluator, // 4
  callAgentEvaluator, // 5
  renameTitleEvaluator, // 6
  callAgentEvaluator, // 7
  createFrameEvaluator, // 8
  callAgentEvaluator, // 9
];

/**
 * Select the evaluator to run for this pass.
 *
 * Uses a weighted rotation: the passIndex selects from ROTATION_SEQUENCE.
 * If the selected evaluator's shouldRun returns false, we try the next ones
 * in the sequence until we find one that can run (or exhaust options).
 */
export function getEvaluatorForPass(passIndex: number): ButlerEvaluator {
  const idx = passIndex % ROTATION_SEQUENCE.length;
  return ROTATION_SEQUENCE[idx];
}

/**
 * Get all evaluators (used when running the final/complete pass).
 */
export function getAllEvaluators(): ButlerEvaluator[] {
  return ALL_EVALUATORS;
}
