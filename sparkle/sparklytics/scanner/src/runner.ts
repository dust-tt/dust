import fs from "node:fs";
import path from "node:path";
import { analyzeColors } from "./analyzers/colorAnalyzer.js";
import { analyzeAllElements } from "./analyzers/componentAnalyzer.js";
import {
  extractDeclaredProps,
  mergeDeclaredProps,
} from "./analyzers/propDeclarationAnalyzer.js";
import { analyzeSpacing } from "./analyzers/spacingAnalyzer.js";
import { analyzeTypography } from "./analyzers/typographyAnalyzer.js";
import { ParseCache } from "./parsers/tsxParser.js";
import { loadRegistry } from "./tokens/registry.js";
import type { ScanConfig, SparkleReport } from "./types.js";
import { collectFiles } from "./utils/fileCollector.js";
import { debug, info } from "./utils/logger.js";

const SCANNER_VERSION = "0.1.0";

function getSparkleVersion(targetDir: string): string {
  try {
    const pkgPath = path.join(
      targetDir,
      "node_modules/@dust-tt/sparkle/package.json"
    );
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
        version?: string;
      };
      return pkg.version ?? "unknown";
    }
  } catch {
    // ignore
  }
  return "unknown";
}

export async function runScan(config: ScanConfig): Promise<SparkleReport> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  info(`Scanning: ${config.targetDir}`);
  info(`Package:  ${config.packageName}`);

  const registry = loadRegistry(config.sparkleTokensPath);
  debug(
    `Loaded token registry with ${Object.keys(registry.colors).length} colors`
  );

  // Collect files
  info("Collecting files...");
  const { tsx: tsxFiles, css: cssFiles } = await collectFiles(config);
  info(
    `Found ${tsxFiles.length} TSX/TS files, ${cssFiles.length} CSS/SCSS files`
  );

  // Parse all TSX files upfront (shared cache)
  const cache = new ParseCache();
  info("Parsing TypeScript/TSX files...");
  let parsed = 0;
  for (const filePath of tsxFiles) {
    cache.parse(filePath);
    parsed++;
    if (parsed % 100 === 0) {
      debug(`  Parsed ${parsed}/${tsxFiles.length}...`);
    }
  }
  info(`Parsed ${cache.size} files successfully`);

  info("Analyzing components, colors, typography, and spacing...");
  const allElements = analyzeAllElements(tsxFiles, cache, config);
  const colors = analyzeColors(tsxFiles, cssFiles, cache, config, registry);
  const typography = analyzeTypography(
    tsxFiles,
    cssFiles,
    cache,
    config,
    registry
  );
  const spacing = analyzeSpacing(tsxFiles, cssFiles, cache, config, registry);

  // Merge declared-but-unused props (totalCount=0) into component data
  const declaredProps = extractDeclaredProps(cache, config.targetDir);
  mergeDeclaredProps(allElements.sparkleComponents, declaredProps);
  mergeDeclaredProps(allElements.customComponents, declaredProps);

  const durationMs = Date.now() - startTime;
  const sparkleVersion = getSparkleVersion(config.targetDir);

  const {
    sparkleComponents,
    totalSparkleUsages,
    totalCustomUsages,
    totalHtmlUsages,
    divCount,
    sparkleRatio,
  } = allElements;

  // Build summary
  const totalUsages = totalSparkleUsages;
  const totalSparkleComponents = registry.componentNames.length;
  const uniqueUsed = sparkleComponents.length;
  const adoptionRate =
    totalSparkleComponents > 0
      ? Math.min(1, uniqueUsed / totalSparkleComponents)
      : 0;

  // Health score: adoption 40% + color 20% + typography 20% + spacing 20%
  const healthScore = Math.round(
    adoptionRate * 40 +
      colors.complianceRate * 20 +
      typography.complianceRate * 20 +
      spacing.complianceRate * 20
  );

  const report: SparkleReport = {
    meta: {
      timestamp,
      reportVersion: "1",
      scannerVersion: SCANNER_VERSION,
      targetDir: config.targetDir,
      packageName: config.packageName,
      excludedDirs: config.excludeDirs,
      fileCount: tsxFiles.length + cssFiles.length,
      durationMs,
      sparkleVersion,
    },
    summary: {
      totalComponents: uniqueUsed,
      totalUsages,
      totalAllComponentUsages: totalSparkleUsages + totalCustomUsages,
      totalHtmlUsages,
      divCount,
      sparkleRatio,
      uniqueColors: colors.uniqueValues,
      nonTokenColors: colors.nonTokenColors.length,
      nonTokenSpacingCount: spacing.nonTokenSpacing.length,
      nonTokenTypographyCount: typography.nonTokenTypography.length,
      adoptionRate,
      colorComplianceRate: colors.complianceRate,
      typographyComplianceRate: typography.complianceRate,
      spacingComplianceRate: spacing.complianceRate,
      healthScore,
    },
    components: sparkleComponents,
    allElements,
    colors,
    typography,
    spacing,
  };

  return report;
}
