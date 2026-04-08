import { Command } from "commander";
import { loadConfig } from "./config.js";
import { runScan } from "./runner.js";
import { writeReport } from "./output/reportWriter.js";
import { setVerbose, info, success, error, printSummaryTable } from "./utils/logger.js";
import { loadRegistry } from "./tokens/registry.js";

const program = new Command();

program
  .name("sparkle-scan")
  .description("Scan a codebase for Sparkle design system usage and token compliance")
  .version("0.1.0");

program
  .command("scan")
  .description("Scan a target directory and produce a JSON report")
  .option("--target-dir <path>", "Path to the codebase to scan")
  .option("--package <name>", "Design system package name (default: @dust-tt/sparkle)")
  .option("--exclude <dirs...>", "Directories to exclude")
  .option("--tokens <path>", "Path to custom sparkle-tokens.json")
  .option("--output <dir>", "Output directory for the report")
  .option("--verbose", "Show detailed progress")
  .action(async (opts) => {
    const config = loadConfig({
      targetDir: opts.targetDir,
      packageName: opts.package,
      excludeDirs: opts.exclude,
      sparkleTokensPath: opts.tokens ?? null,
      outputDir: opts.output,
      verbose: opts.verbose ?? false,
    });

    setVerbose(config.verbose);

    try {
      const report = await runScan(config);
      const outPath = writeReport(report, config.outputDir);

      success(`Report written to: ${outPath}`);

      printSummaryTable([
        ["Components used", `${report.summary.totalComponents} / ${report.components.length > 0 ? report.components.length : "—"}`],
        ["Total usages", report.summary.totalUsages],
        ["Adoption rate", `${(report.summary.adoptionRate * 100).toFixed(1)}%`],
        ["Health score", `${report.summary.healthScore}/100`],
        ["Non-token colors", report.summary.nonTokenColors],
        ["Non-token typography", report.summary.nonTokenTypographyCount],
        ["Non-token spacing", report.summary.nonTokenSpacingCount],
        ["Color compliance", `${(report.summary.colorComplianceRate * 100).toFixed(1)}%`],
        ["Scan duration", `${report.meta.durationMs}ms`],
      ]);
    } catch (e) {
      error(`Scan failed: ${String(e)}`);
      process.exit(1);
    }
  });

program
  .command("tokens")
  .description("Print the active token registry as JSON")
  .option("--tokens <path>", "Path to custom sparkle-tokens.json")
  .action((opts) => {
    try {
      const registry = loadRegistry(opts.tokens ?? null);
      console.log(JSON.stringify(registry, null, 2));
    } catch (e) {
      error(`Could not load tokens: ${String(e)}`);
      process.exit(1);
    }
  });

program.parseAsync(process.argv).catch((e) => {
  error(String(e));
  process.exit(1);
});
