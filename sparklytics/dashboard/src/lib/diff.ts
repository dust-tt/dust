import type { ComponentDiff, ReportDiff, SparkleReport } from "./types";
import { computeHealthScore } from "./metrics";

export function diffReports(
  a: SparkleReport,
  b: SparkleReport
): ReportDiff {
  const aComponents = new Map(a.components.map((c) => [c.name, c]));
  const bComponents = new Map(b.components.map((c) => [c.name, c]));

  const addedComponents: string[] = [];
  const removedComponents: string[] = [];
  const changedComponents: ComponentDiff[] = [];

  // Components in B but not A
  for (const [name, comp] of bComponents) {
    if (!aComponents.has(name)) {
      addedComponents.push(name);
    } else {
      const aComp = aComponents.get(name)!;
      const delta = comp.usageCount - aComp.usageCount;
      if (delta !== 0) {
        changedComponents.push({
          name,
          usageCountA: aComp.usageCount,
          usageCountB: comp.usageCount,
          delta,
          trend: delta > 0 ? "up" : "down",
        });
      }
    }
  }

  // Components in A but not B
  for (const name of aComponents.keys()) {
    if (!bComponents.has(name)) {
      removedComponents.push(name);
    }
  }

  // Sort changed by absolute delta descending
  changedComponents.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  return {
    reportAId: a.meta.timestamp,
    reportBId: b.meta.timestamp,
    addedComponents,
    removedComponents,
    changedComponents,
    colorViolationsDelta:
      b.summary.nonTokenColors - a.summary.nonTokenColors,
    typographyViolationsDelta:
      b.summary.nonTokenTypographyCount - a.summary.nonTokenTypographyCount,
    spacingViolationsDelta:
      b.summary.nonTokenSpacingCount - a.summary.nonTokenSpacingCount,
    healthScoreDelta: computeHealthScore(b) - computeHealthScore(a),
    adoptionRateDelta: b.summary.adoptionRate - a.summary.adoptionRate,
  };
}
