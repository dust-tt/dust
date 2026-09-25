import type { CaseCoordinates, EvalConfig } from "./types";

export function caseCount(config: { rows: unknown[]; variants: unknown[]; repetitions: number }): number {
  return config.rows.length * config.variants.length * config.repetitions;
}

export function caseCoordinates(config: EvalConfig, caseIndex: number): CaseCoordinates {
  if (!Number.isInteger(caseIndex) || caseIndex < 0 || caseIndex >= caseCount(config)) {
    throw new Error("Invalid case index");
  }
  return {
    rowIndex: Math.floor(caseIndex / (config.variants.length * config.repetitions)),
    variantIndex: Math.floor(caseIndex / config.repetitions) % config.variants.length,
    repetition: caseIndex % config.repetitions,
  };
}
