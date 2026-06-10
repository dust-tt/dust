import {
  aggregateResults,
  costEfficiency,
  qualityAboveReference,
} from "./cost-metric";
import type {
  AggregateSummary,
  CriteriaByTask,
  EvalRow,
  RawJudgeScores,
  RawScoreByTask,
  RawScoresFile,
  RunResults,
  TaskCriteria,
  TaskScoreEntry,
} from "./types";

const DIMENSIONS = [
  "comprehensiveness",
  "insight",
  "instruction_following",
  "readability",
  "source_quality",
] as const;

export function computeTaskTotals(
  scores: RawJudgeScores,
  criteria: TaskCriteria
): { targetTotal: number; referenceTotal: number } {
  let targetTotal = 0;
  let referenceTotal = 0;

  for (const dim of DIMENSIONS) {
    const dimWeight = criteria.dimension_weights[dim];
    const dimCriteria = criteria.criteria[dim];

    let dimTarget = 0;
    let dimReference = 0;

    for (const criterion of dimCriteria) {
      const criterionScore = scores[dim][criterion.name];
      dimTarget += criterionScore.article_1 * criterion.weight;
      dimReference += criterionScore.article_2 * criterion.weight;
    }

    targetTotal += dimTarget * dimWeight;
    referenceTotal += dimReference * dimWeight;
  }

  return { targetTotal, referenceTotal };
}

export function computeRaceScore(targetTotal: number, referenceTotal: number): number {
  const denom = targetTotal + referenceTotal;
  if (denom <= 0) {
    return 0.5;
  }
  return targetTotal / denom;
}

export function buildTaskScoreEntries(params: {
  rows: EvalRow[];
  runResults: RunResults;
  rawScores: RawScoresFile;
}): TaskScoreEntry[] {
  const rowsById = new Map(params.rows.map((row) => [row.id, row]));
  const entries: TaskScoreEntry[] = [];

  for (const [taskId, raw] of Object.entries(params.rawScores)) {
    const row = rowsById.get(taskId);
    const run = params.runResults[taskId];
    if (!row || !run) {
      continue;
    }
    const raceScore = raw.race_score;
    const costEff = costEfficiency(raceScore, run.cost.total_usd);
    const qualityPerUsd = qualityAboveReference(raceScore, run.cost.total_usd);

    entries.push({
      task_id: taskId,
      category: row.category,
      race_score: round4(raceScore),
      target_total: round4(raw.target_total),
      reference_total: round4(raw.reference_total),
      latency_ms: run.latency_ms,
      cost: run.cost,
      cost_efficiency: round4(costEff),
      quality_above_reference_per_usd: round4(qualityPerUsd),
    });
  }

  entries.sort((a, b) => Number(a.task_id) - Number(b.task_id));
  return entries;
}

export function computeSummary(entries: TaskScoreEntry[]): AggregateSummary {
  return aggregateResults(entries);
}

export function buildRawScoreEntry(
  scores: RawJudgeScores,
  criteria: TaskCriteria
): RawScoreByTask {
  const { targetTotal, referenceTotal } = computeTaskTotals(scores, criteria);
  const raceScore = computeRaceScore(targetTotal, referenceTotal);
  return {
    scores,
    target_total: round4(targetTotal),
    reference_total: round4(referenceTotal),
    race_score: round4(raceScore),
  };
}

export function taskIdsInOrder(criteriaByTask: CriteriaByTask): string[] {
  return Object.keys(criteriaByTask).sort((a, b) => Number(a) - Number(b));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
