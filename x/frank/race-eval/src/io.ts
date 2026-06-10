import { readFile, writeFile } from "fs/promises";
import { parse } from "csv-parse/sync";
import type { EvalRow } from "./types";

const MAX_RECORD_SIZE = 10_000_000;

export async function loadEvalCsv(path: string): Promise<EvalRow[]> {
  const content = await readFile(path, "utf-8");
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    max_record_size: MAX_RECORD_SIZE,
  }) as Record<string, string>[];

  return records.map((record) => ({
    id: requireField(record, "id"),
    category: record["category"] ?? "",
    task: requireField(record, "task"),
    reference_report: requireField(record, "reference_report"),
  }));
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as T;
}

export async function writeCsv(path: string, headers: string[], rows: Array<Record<string, string | number>>) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    const cells = headers.map((header) => escapeCsvCell(row[header]));
    lines.push(cells.join(","));
  }
  await writeFile(path, `${lines.join("\n")}\n`, "utf-8");
}

function requireField(record: Record<string, string>, key: string): string {
  const value = record[key];
  if (!value) {
    throw new Error(`Missing required CSV column value: ${key}`);
  }
  return value;
}

function escapeCsvCell(value: string | number | undefined): string {
  const text = value === undefined ? "" : String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}
