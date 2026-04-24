import fs from "node:fs";
import path from "node:path";
import type { SparkleReport } from "../types.js";

export function writeReport(report: SparkleReport, outputDir: string): string {
  fs.mkdirSync(outputDir, { recursive: true });

  const safeTimestamp = report.meta.timestamp.replace(/[:.]/g, "-");
  const filename = `sparkle-report-${safeTimestamp}.json`;
  const outPath = path.join(outputDir, filename);

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
  return outPath;
}
