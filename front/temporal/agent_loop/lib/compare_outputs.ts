import type { GetOutputResponse } from "@app/temporal/agent_loop/lib/types";

export type ComparisonResult = {
  // Structural comparisons (should be identical)
  sameActionsCount: boolean;
  sameActionNames: boolean;
  sameContentStructure: boolean;

  // Output type comparison (critical)
  bothAreActions: boolean;
  bothAreGenerations: boolean;
  outputTypeMismatch: boolean;

  // Length comparisons (with tolerance for LLM variance)
  generationLengthRatio: number | null; // null if no generation
  generationLengthDifferencePercent: number | null;

  // Summary
  hasCriticalDifferences: boolean;
  summary: string;

  // Time to first event comparison
  timeRatio: number | null;
};

/**
 * Compare two LLM outputs to detect significant structural differences.
 * Since LLM outputs are non-deterministic, we focus on structural and behavioral differences
 * rather than exact text matching.
 */
export function compareOutputs(
  coreOutput: PromiseSettledResult<GetOutputResponse>,
  llmOutput: PromiseSettledResult<GetOutputResponse>
): ComparisonResult | null {
  // if either response is rejected, we can't compare
  if (coreOutput.status === "rejected" || llmOutput.status === "rejected") {
    return null;
  }

  // If either output is an error, we can't compare

  if (coreOutput.value.isErr() || llmOutput.value.isErr()) {
    return null;
  }

  const core = coreOutput.value.value;
  const llm = llmOutput.value.value;

  // 1. Compare action count
  const sameActionsCount =
    core.output.actions.length === llm.output.actions.length;

  // 2. Compare action names (tools called)
  const sameActionNames = core.output.actions.every(
    (action, idx) => llm.output.actions[idx]?.name === action.name
  );

  // 3. Compare content structure (types and count)
  const sameContentStructure =
    core.output.contents.length === llm.output.contents.length &&
    core.output.contents.every(
      (content, idx) => llm.output.contents[idx]?.type === content.type
    );

  // 4. Determine output type
  const coreIsAction = core.output.actions.length > 0;
  const llmIsAction = llm.output.actions.length > 0;
  const bothAreActions = coreIsAction && llmIsAction;
  const bothAreGenerations = !coreIsAction && !llmIsAction;
  const outputTypeMismatch = coreIsAction !== llmIsAction;

  // 5. Compare generation lengths (only if both are generations)
  let generationLengthRatio: number | null = null;
  let generationLengthDifferencePercent: number | null = null;

  if (bothAreGenerations) {
    const coreGenLength = (core.output.generation ?? "").length;
    const llmGenLength = (llm.output.generation ?? "").length;

    if (coreGenLength > 0 || llmGenLength > 0) {
      const maxLength = Math.max(coreGenLength, llmGenLength);
      const minLength = Math.min(coreGenLength, llmGenLength);

      if (maxLength > 0) {
        generationLengthRatio = minLength / maxLength;
        const lengthDiff = Math.abs(coreGenLength - llmGenLength);
        generationLengthDifferencePercent = (lengthDiff / maxLength) * 100;
      }
    }
  }

  // 6. Determine critical differences
  const hasCriticalDifferences =
    outputTypeMismatch || // One returned actions, the other didn't
    (bothAreActions && !sameActionNames) || // Different tools called
    (bothAreGenerations &&
      generationLengthDifferencePercent !== null &&
      generationLengthDifferencePercent > 50); // Generation length differs by >50%

  // 7. Generate summary
  let summary = "";
  if (outputTypeMismatch) {
    summary = coreIsAction
      ? "core returned actions, llm returned generation"
      : "core returned generation, llm returned actions";
  } else if (bothAreActions) {
    if (!sameActionsCount) {
      summary = `Actions count differs: core=${core.output.actions.length}, llm=${llm.output.actions.length}`;
    } else if (!sameActionNames) {
      summary = `Different tools called: core=[${core.output.actions.map((a) => a.name).join(", ")}], llm=[${llm.output.actions.map((a) => a.name).join(", ")}]`;
    } else {
      summary = "Same tools called in same order";
    }
  } else if (bothAreGenerations) {
    if (generationLengthDifferencePercent !== null) {
      summary = `Both generated text. Length difference: ${generationLengthDifferencePercent.toFixed(1)}%`;
    } else {
      summary = "Both generated empty text";
    }
  }

  if (!sameContentStructure && !hasCriticalDifferences) {
    summary += " (content structure differs)";
  }

  // 8 Compare time to first event
  let timeRatio: number | null = null;
  if (core.timeToFirstEvent && llm.timeToFirstEvent) {
    timeRatio =
      Math.round((llm.timeToFirstEvent / core.timeToFirstEvent) * 100) / 100;
  }

  return {
    sameActionsCount,
    sameActionNames,
    sameContentStructure,
    bothAreActions,
    bothAreGenerations,
    outputTypeMismatch,
    generationLengthRatio,
    generationLengthDifferencePercent,
    hasCriticalDifferences,
    summary,
    timeRatio,
  };
}
