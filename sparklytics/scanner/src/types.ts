// ─── Configuration ────────────────────────────────────────────────────────────

export interface ScanConfig {
  targetDir: string;
  packageName: string; // default: "@dust-tt/sparkle"
  excludeDirs: string[]; // default: ["node_modules", ".next", "dist"]
  sparkleTokensPath: string | null; // path to custom token registry JSON
  outputDir: string;
  verbose: boolean;
}

// ─── Token Registry ──────────────────────────────────────────────────────────

export interface SparkleTokenRegistry {
  colors: Record<string, string>; // "gray-950" -> "#111418" (lowercase hex)
  fontSizes: string[]; // ["12px", "14px", ...]
  fontFamilies: string[]; // ["Geist", "Geist Mono"]
  fontWeights: number[]; // [100, 200, ..., 900]
  lineHeights: string[]; // ["16px", "20px", ...]
  spacingScale: string[]; // ["0", "1px", "2px", "4px", ...]
  componentNames: string[]; // all exported component names
}

// ─── File Location ────────────────────────────────────────────────────────────

export interface FileLocation {
  filePath: string; // relative to targetDir
  line: number;
  column: number;
}

// ─── Component Analysis ──────────────────────────────────────────────────────

export interface ImportBinding {
  localName: string; // what the file calls it
  importedName: string; // what sparkle exports it as
  importedFrom: string; // the package specifier
}

export interface PropOccurrence {
  name: string;
  values: string[]; // all distinct values seen
  frequency: Record<string, number>; // value -> count
  totalCount: number;
}

export interface ComponentUsage {
  name: string;
  importedFrom: string;
  usageCount: number;
  defaultUsageCount: number; // zero-prop JSX usages
  customizedUsageCount: number; // JSX with at least one prop
  locations: FileLocation[];
  props: PropOccurrence[];
}

// ─── All-Elements Analysis ───────────────────────────────────────────────────

/** Raw HTML element usage (div, span, p, section, etc.) */
export interface HtmlElementUsage {
  tag: string; // "div", "span", "button", etc.
  usageCount: number;
  locations: FileLocation[];
}

/** All JSX elements found in the codebase, bucketed by origin */
export interface AllElementsAnalysis {
  sparkleComponents: ComponentUsage[]; // from configured packageName
  customComponents: ComponentUsage[]; // from any other source (libraries + local)
  htmlElements: HtmlElementUsage[]; // raw HTML tags, sorted by count desc
  totalSparkleUsages: number;
  totalCustomUsages: number;
  totalHtmlUsages: number;
  sparkleRatio: number; // sparkleUsages / (sparkle + custom), excludes HTML
  divCount: number; // <div> usages specifically
}

// ─── Token Violation ─────────────────────────────────────────────────────────

export interface TokenViolation {
  filePath: string; // relative to targetDir
  line: number;
  column: number;
  property: string; // e.g. "color", "font-size", "margin"
  value: string; // the raw detected value
  context: "css" | "scss" | "inline-style" | "className";
  isSparkleToken: boolean;
  suggestedToken?: string; // nearest Sparkle token name if identifiable
}

// ─── Token Analyses ──────────────────────────────────────────────────────────

export interface ColorAnalysis {
  tokenColors: TokenViolation[];
  nonTokenColors: TokenViolation[];
  totalUsages: number;
  uniqueValues: number;
  complianceRate: number; // 0–1
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

// ─── Report ──────────────────────────────────────────────────────────────────

export interface ReportMeta {
  timestamp: string; // ISO 8601
  reportVersion: "1";
  scannerVersion: string;
  targetDir: string;
  packageName: string;
  excludedDirs: string[];
  fileCount: number;
  durationMs: number;
  sparkleVersion: string;
}

export interface ReportSummary {
  totalComponents: number; // unique sparkle component names found
  totalUsages: number; // sum of sparkle component usages
  totalAllComponentUsages: number; // sparkle + custom (no HTML)
  totalHtmlUsages: number; // raw HTML element usages
  divCount: number; // <div> usages specifically
  sparkleRatio: number; // sparkleUsages / (sparkle + custom)
  uniqueColors: number;
  nonTokenColors: number;
  nonTokenSpacingCount: number;
  nonTokenTypographyCount: number;
  adoptionRate: number; // unique used / total available in registry
  colorComplianceRate: number;
  typographyComplianceRate: number;
  spacingComplianceRate: number;
  healthScore: number; // 0–100 composite
}

export interface SparkleReport {
  meta: ReportMeta;
  summary: ReportSummary;
  components: ComponentUsage[]; // sparkle components only (backward compat)
  allElements: AllElementsAnalysis;
  colors: ColorAnalysis;
  typography: TypographyAnalysis;
  spacing: SpacingAnalysis;
}
