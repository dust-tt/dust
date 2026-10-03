import type {
  SparkleReport,
  ComponentUsage,
  TrendPoint,
  ForecastPoint,
  LeaderboardEntry,
  InsightItem,
} from "./types";

export interface UnusedPropEntry {
  componentName: string;
  componentUsageCount: number;
  importedFrom: string;
  propName: string;
  propUsageCount: number;
}

export function computeHealthScore(report: SparkleReport): number {
  const { adoptionRate, colorComplianceRate, typographyComplianceRate, spacingComplianceRate } =
    report.summary;
  return Math.round(
    adoptionRate * 40 +
      colorComplianceRate * 20 +
      typographyComplianceRate * 20 +
      spacingComplianceRate * 20
  );
}

export function reportToTrendPoint(report: SparkleReport): TrendPoint {
  return {
    date: report.meta.timestamp.split("T")[0],
    healthScore: computeHealthScore(report),
    adoptionRate: report.summary.adoptionRate,
    totalUsages: report.summary.totalUsages,
    colorComplianceRate: report.summary.colorComplianceRate,
    typographyComplianceRate: report.summary.typographyComplianceRate,
    spacingComplianceRate: report.summary.spacingComplianceRate,
    sparkleRatio: report.summary.sparkleRatio ?? 0,
    reportId: report.meta.timestamp,
  };
}

export function computeTrend(reports: SparkleReport[]): TrendPoint[] {
  return reports.map(reportToTrendPoint);
}

/** Simple linear regression forecast. Returns next `days` daily points. */
export function computeForecast(
  points: TrendPoint[],
  metric: keyof Pick<TrendPoint, "healthScore" | "adoptionRate">,
  days = 30
): ForecastPoint[] {
  if (points.length < 2) return [];

  const n = points.length;
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => Number(p[metric]));

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumX2 = xs.reduce((acc, x) => acc + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const lastDate = new Date(points[points.length - 1].date);
  const forecast: ForecastPoint[] = [];

  for (let i = 1; i <= days; i++) {
    const projected = intercept + slope * (n - 1 + i);
    const clipped = Math.min(100, Math.max(0, projected));
    const date = new Date(lastDate);
    date.setDate(date.getDate() + i);
    forecast.push({
      date: date.toISOString().split("T")[0],
      value: Math.round(clipped * 10) / 10,
      isForecast: true,
    });
  }

  return forecast;
}

export function computeLeaderboard(report: SparkleReport): LeaderboardEntry[] {
  // Group components by top-level folder
  const folderMap = new Map<string, { usages: number; files: Set<string> }>();

  for (const component of report.components) {
    for (const loc of component.locations) {
      const parts = loc.filePath.split("/");
      const dirParts = parts.slice(0, -1); // strip filename
      const depth = Math.min(2, dirParts.length);
      const folder = depth === 0 ? "root" : dirParts.slice(0, depth).join("/");
      if (!folderMap.has(folder)) {
        folderMap.set(folder, { usages: 0, files: new Set() });
      }
      const entry = folderMap.get(folder)!;
      entry.usages += 1;
      entry.files.add(loc.filePath);
    }
  }

  return Array.from(folderMap.entries())
    .map(([folder, data]) => ({
      folder,
      sparkleUsages: data.usages,
      fileCount: data.files.size,
      adoptionDensity:
        data.files.size > 0 ? data.usages / data.files.size : 0,
    }))
    .sort((a, b) => b.sparkleUsages - a.sparkleUsages)
    .slice(0, 10);
}

export function computeInsights(
  report: SparkleReport,
  previous: SparkleReport | null
): InsightItem[] {
  const insights: InsightItem[] = [];

  // Non-token color usage
  if (report.summary.nonTokenColors > 20) {
    insights.push({
      severity: "critical",
      title: "High non-token color usage",
      description: `${report.summary.nonTokenColors} hardcoded color values detected. Use Sparkle color tokens instead.`,
      metrics: [
        { value: report.summary.nonTokenColors, label: "Violations" },
        { value: `${(report.summary.colorComplianceRate * 100).toFixed(0)}%`, label: "Compliance" },
      ],
    });
  } else if (report.summary.nonTokenColors > 0) {
    insights.push({
      severity: "warning",
      title: "Non-token colors detected",
      description: `${report.summary.nonTokenColors} hardcoded color values should be migrated to Sparkle tokens.`,
      metrics: [{ value: report.summary.nonTokenColors, label: "Violations" }],
    });
  }

  // Low adoption rate
  if (report.summary.adoptionRate < 0.3) {
    insights.push({
      severity: "critical",
      title: "Low Sparkle adoption",
      description: `Only ${(report.summary.adoptionRate * 100).toFixed(1)}% of available Sparkle components are being used.`,
      metrics: [
        { value: `${(report.summary.adoptionRate * 100).toFixed(1)}%`, label: "Adoption rate" },
        { value: report.summary.totalComponents, label: "Components used" },
      ],
    });
  }

  // Typography violations
  if (report.summary.nonTokenTypographyCount > 10) {
    insights.push({
      severity: "warning",
      title: "Typography out of scale",
      description: `${report.summary.nonTokenTypographyCount} typography values don't match the Sparkle type scale.`,
      metrics: [{ value: report.summary.nonTokenTypographyCount, label: "Violations" }],
    });
  }

  // Spacing violations
  if (report.summary.nonTokenSpacingCount > 10) {
    insights.push({
      severity: "warning",
      title: "Spacing inconsistencies",
      description: `${report.summary.nonTokenSpacingCount} spacing values aren't on the Sparkle spacing scale.`,
      metrics: [{ value: report.summary.nonTokenSpacingCount, label: "Violations" }],
    });
  }

  // Regression compared to previous scan
  if (previous) {
    const healthDelta =
      computeHealthScore(report) - computeHealthScore(previous);
    if (healthDelta < -5) {
      const adoptionDelta =
        report.summary.adoptionRate - previous.summary.adoptionRate;
      insights.push({
        severity: "critical",
        title: "Health score regression",
        description: `Health score dropped by ${Math.abs(healthDelta)} points since the last scan.`,
        metrics: [
          { value: `${healthDelta}`, label: "Health delta" },
          { value: `${adoptionDelta >= 0 ? "+" : ""}${(adoptionDelta * 100).toFixed(1)}%`, label: "Adoption delta" },
        ],
      });
    }

    const adoptionDelta =
      report.summary.adoptionRate - previous.summary.adoptionRate;
    if (adoptionDelta > 0.02) {
      insights.push({
        severity: "info",
        title: "Adoption improving",
        description: `Adoption rate increased by ${(adoptionDelta * 100).toFixed(1)}% since the last scan.`,
        metrics: [{ value: `+${(adoptionDelta * 100).toFixed(1)}%`, label: "Adoption delta" }],
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      severity: "info",
      title: "Looking good!",
      description: "No significant issues detected in the latest scan.",
    });
  }

  return insights.slice(0, 5);
}

/** Props used in <5% of a component's occurrences, sorted by component popularity. Includes both Sparkle and custom components. */
export function computeUnusedProps(report: SparkleReport, limit = 50): UnusedPropEntry[] {
  const results: UnusedPropEntry[] = [];
  const all = [
    ...report.components,
    ...(report.allElements?.customComponents ?? []),
  ].sort((a, b) => b.usageCount - a.usageCount);
  for (const comp of all) {
    for (const prop of comp.props) {
      if (prop.totalCount === 0) {
        results.push({
          componentName: comp.name,
          componentUsageCount: comp.usageCount,
          importedFrom: comp.importedFrom,
          propName: prop.name,
          propUsageCount: prop.totalCount,
        });
        if (results.length >= limit) return results;
      }
    }
  }
  return results;
}

export function computeLeastUsedComponents(report: SparkleReport, limit = 15): ComponentUsage[] {
  return [...report.components].sort((a, b) => a.usageCount - b.usageCount).slice(0, limit);
}

export function computeMostUsedNonSparkle(report: SparkleReport, limit = 15): ComponentUsage[] {
  return [...(report.allElements?.customComponents ?? [])]
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, limit);
}

export interface FolderEntry {
  folder: string;
  sparkleUsages: number;
  customUsages: number;
  totalUsages: number;
  fileCount: number;
}

export interface FolderComponentEntry {
  name: string;
  isSparkle: boolean;
  usageInFolder: number;
}

export interface FolderDetail {
  folder: string;
  sparkleUsages: number;
  customUsages: number;
  fileCount: number;
  files: string[];
  components: FolderComponentEntry[];
}

function fileToFolder(filePath: string): string {
  const parts = filePath.split("/");
  return parts.slice(0, -1).join("/") || "root";
}

export function computeFolderList(report: SparkleReport): FolderEntry[] {
  const map = new Map<string, { sparkle: number; custom: number; files: Set<string> }>();

  function add(filePath: string, isSparkle: boolean) {
    const folder = fileToFolder(filePath);
    if (!map.has(folder)) map.set(folder, { sparkle: 0, custom: 0, files: new Set() });
    const e = map.get(folder)!;
    if (isSparkle) e.sparkle += 1;
    else e.custom += 1;
    e.files.add(filePath);
  }

  for (const comp of report.components) {
    for (const loc of comp.locations) add(loc.filePath, true);
  }
  for (const comp of report.allElements?.customComponents ?? []) {
    for (const loc of comp.locations) add(loc.filePath, false);
  }

  return [...map.entries()]
    .map(([folder, data]) => ({
      folder,
      sparkleUsages: data.sparkle,
      customUsages: data.custom,
      totalUsages: data.sparkle + data.custom,
      fileCount: data.files.size,
    }))
    .sort((a, b) => b.sparkleUsages - a.sparkleUsages);
}

export function computeFolderDetail(report: SparkleReport, folder: string): FolderDetail | null {
  const files = new Set<string>();
  const componentMap = new Map<string, FolderComponentEntry>();
  let sparkleUsages = 0;
  let customUsages = 0;

  for (const comp of report.components) {
    const locs = comp.locations.filter((loc) => fileToFolder(loc.filePath) === folder);
    if (locs.length === 0) continue;
    for (const loc of locs) files.add(loc.filePath);
    sparkleUsages += locs.length;
    componentMap.set(comp.name, {
      name: comp.name,
      isSparkle: true,
      usageInFolder: (componentMap.get(comp.name)?.usageInFolder ?? 0) + locs.length,
    });
  }

  for (const comp of report.allElements?.customComponents ?? []) {
    const locs = comp.locations.filter((loc) => fileToFolder(loc.filePath) === folder);
    if (locs.length === 0) continue;
    for (const loc of locs) files.add(loc.filePath);
    customUsages += locs.length;
    componentMap.set(comp.name, {
      name: comp.name,
      isSparkle: false,
      usageInFolder: (componentMap.get(comp.name)?.usageInFolder ?? 0) + locs.length,
    });
  }

  if (files.size === 0) return null;

  return {
    folder,
    sparkleUsages,
    customUsages,
    fileCount: files.size,
    files: [...files].sort(),
    components: [...componentMap.values()].sort((a, b) => b.usageInFolder - a.usageInFolder),
  };
}

/** Components present in the latest report but absent from the oldest available report. */
export function computeRecentlyAdded(reports: SparkleReport[], limit = 15): string[] {
  if (reports.length < 2) return [];
  const latest = reports[reports.length - 1];
  const oldest = reports[0];
  const oldNames = new Set(oldest.components.map((c) => c.name));
  return latest.components
    .filter((c) => !oldNames.has(c.name))
    .map((c) => c.name)
    .slice(0, limit);
}
