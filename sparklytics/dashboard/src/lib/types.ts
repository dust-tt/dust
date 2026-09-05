// ─── Scanner types (duplicated here to avoid cross-package TS resolution) ─────

export interface FileLocation {
  filePath: string;
  line: number;
  column: number;
}

export interface PropOccurrence {
  name: string;
  values: string[];
  frequency: Record<string, number>;
  totalCount: number;
}

export interface ComponentUsage {
  name: string;
  importedFrom: string;
  usageCount: number;
  defaultUsageCount: number;
  customizedUsageCount: number;
  locations: FileLocation[];
  props: PropOccurrence[];
}

export interface TokenViolation {
  filePath: string;
  line: number;
  column: number;
  property: string;
  value: string;
  context: "css" | "scss" | "inline-style" | "className";
  isSparkleToken: boolean;
  suggestedToken?: string;
}

export interface ColorAnalysis {
  tokenColors: TokenViolation[];
  nonTokenColors: TokenViolation[];
  totalUsages: number;
  uniqueValues: number;
  complianceRate: number;
}

export interface TypographyAnalysis {
  tokenTypography: TokenViolation[];
  nonTokenTypography: TokenViolation[];
  totalUsages: number;
  complianceRate: number;
}

export interface SpacingAnalysis {
  tokenSpacing: TokenViolation[];
  nonTokenSpacing: TokenViolation[];
  totalUsages: number;
  complianceRate: number;
}

export interface ReportMeta {
  timestamp: string;
  reportVersion: "1";
  scannerVersion: string;
  targetDir: string;
  packageName: string;
  excludedDirs: string[];
  fileCount: number;
  durationMs: number;
  sparkleVersion: string;
}

export interface HtmlElementUsage {
  tag: string;
  usageCount: number;
  locations: FileLocation[];
}

export interface AllElementsAnalysis {
  sparkleComponents: ComponentUsage[];
  customComponents: ComponentUsage[];
  htmlElements: HtmlElementUsage[];
  totalSparkleUsages: number;
  totalCustomUsages: number;
  totalHtmlUsages: number;
  sparkleRatio: number;
  divCount: number;
}

export interface ReportSummary {
  totalComponents: number;
  totalUsages: number;
  totalAllComponentUsages: number;
  totalHtmlUsages: number;
  divCount: number;
  sparkleRatio: number;
  uniqueColors: number;
  nonTokenColors: number;
  nonTokenSpacingCount: number;
  nonTokenTypographyCount: number;
  adoptionRate: number;
  colorComplianceRate: number;
  typographyComplianceRate: number;
  spacingComplianceRate: number;
  healthScore: number;
}

export interface SparkleReport {
  meta: ReportMeta;
  summary: ReportSummary;
  components: ComponentUsage[];
  allElements: AllElementsAnalysis;
  colors: ColorAnalysis;
  typography: TypographyAnalysis;
  spacing: SpacingAnalysis;
}

// ─── Dashboard-specific types ─────────────────────────────────────────────────

export interface TrendPoint {
  date: string; // ISO date string
  healthScore: number;
  adoptionRate: number;
  totalUsages: number;
  colorComplianceRate: number;
  typographyComplianceRate: number;
  spacingComplianceRate: number;
  sparkleRatio: number; // sparkle / (sparkle + custom) component usages
  reportId: string;
}

export interface ForecastPoint {
  date: string;
  value: number;
  isForecast: true;
}

export interface LeaderboardEntry {
  folder: string;
  sparkleUsages: number;
  fileCount: number;
  adoptionDensity: number;
}

export interface ReportDiff {
  reportAId: string;
  reportBId: string;
  addedComponents: string[];
  removedComponents: string[];
  changedComponents: ComponentDiff[];
  colorViolationsDelta: number;
  typographyViolationsDelta: number;
  spacingViolationsDelta: number;
  healthScoreDelta: number;
  adoptionRateDelta: number;
}

export interface ComponentDiff {
  name: string;
  usageCountA: number;
  usageCountB: number;
  delta: number;
  trend: "up" | "down" | "stable";
}

export interface InsightMetric {
  value: string | number;
  label: string;
}

export interface InsightItem {
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  value?: string | number;    // single unlabeled metric (legacy)
  metrics?: InsightMetric[];  // one or more labeled metrics
}
