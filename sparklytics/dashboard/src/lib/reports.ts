import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { ReportMeta, SparkleReport } from "./types";

const REPORTS_DIR = path.join(process.cwd(), "reports");

function reportIdFromFilename(filename: string): string {
  return filename.replace(/^sparkle-report-/, "").replace(/\.json$/, "");
}

function filenameFromId(id: string): string {
  return `sparkle-report-${id}.json`;
}

export function listReports(): ReportMeta[] {
  if (!fs.existsSync(REPORTS_DIR)) return [];

  const files = fs
    .readdirSync(REPORTS_DIR)
    .filter((f) => f.startsWith("sparkle-report-") && f.endsWith(".json"))
    .sort(); // ISO timestamps sort lexicographically = chronological

  return files.map((filename) => {
    const id = reportIdFromFilename(filename);
    const filePath = path.join(REPORTS_DIR, filename);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const report = JSON.parse(raw) as SparkleReport;
      return report.meta;
    } catch {
      // Fallback meta from filename
      const timestamp = id.replace(/-/g, (_, i) =>
        i < 10 ? (i === 4 || i === 7 ? "-" : i === 10 ? "T" : ":") : ":"
      );
      return {
        timestamp,
        reportVersion: "1" as const,
        scannerVersion: "unknown",
        targetDir: "unknown",
        packageName: "@dust-tt/sparkle",
        excludedDirs: [],
        fileCount: 0,
        durationMs: 0,
        sparkleVersion: "unknown",
      };
    }
  });
}

export function getReport(id: string): SparkleReport | null {
  const filePath = path.join(REPORTS_DIR, filenameFromId(id));
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as SparkleReport;
  } catch {
    return null;
  }
}

export function getLatestReport(): SparkleReport | null {
  if (!fs.existsSync(REPORTS_DIR)) return null;

  const files = fs
    .readdirSync(REPORTS_DIR)
    .filter((f) => f.startsWith("sparkle-report-") && f.endsWith(".json"))
    .sort();

  if (files.length === 0) return null;
  const latest = files[files.length - 1];
  return getReport(reportIdFromFilename(latest));
}

/** Returns the last N reports (summaries + meta only, not full violation arrays) */
export function getReportsForTrend(limit = 30): SparkleReport[] {
  if (!fs.existsSync(REPORTS_DIR)) return [];

  const files = fs
    .readdirSync(REPORTS_DIR)
    .filter((f) => f.startsWith("sparkle-report-") && f.endsWith(".json"))
    .sort()
    .slice(-limit);

  return files
    .map((f) => getReport(reportIdFromFilename(f)))
    .filter((r): r is SparkleReport => r !== null);
}

export function getAllReportIds(): string[] {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  return fs
    .readdirSync(REPORTS_DIR)
    .filter((f) => f.startsWith("sparkle-report-") && f.endsWith(".json"))
    .sort()
    .map(reportIdFromFilename);
}
