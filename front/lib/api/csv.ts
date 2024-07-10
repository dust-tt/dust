import { parse } from "csv-parse";

const POSSIBLE_VALUES_MAX_LEN = 32;
const POSSIBLE_VALUES_MAX_COUNT = 16;

interface ColumnTypeInfo {
  type: "string" | "number" | "boolean";
  possibleValues?: string[];
}

export interface CSVRow {
  [key: string]: string;
}

/**
 * Detect the type of a column based on its values.
 */
function detectColumnType(columnValues: Iterable<string>): ColumnTypeInfo {
  const uniqueValues = new Set<string>();
  let allNumbers = true;
  let allBooleans = true;

  for (const value of columnValues) {
    uniqueValues.add(value);

    if (allNumbers && isNaN(Number(value))) {
      allNumbers = false;
    }

    if (
      allBooleans &&
      !(value.toLowerCase() === "true" || value.toLowerCase() === "false")
    ) {
      allBooleans = false;
    }

    if (
      !allNumbers &&
      !allBooleans &&
      uniqueValues.size > POSSIBLE_VALUES_MAX_COUNT
    ) {
      break; // Early exit if no further checks are needed
    }
  }

  let possibleValues = null;
  if (
    uniqueValues.size <= POSSIBLE_VALUES_MAX_COUNT &&
    Array.from(uniqueValues).every(
      (value) => value.length <= POSSIBLE_VALUES_MAX_LEN
    )
  ) {
    possibleValues = Array.from(uniqueValues);
  }

  if (allNumbers) {
    return possibleValues
      ? { type: "number", possibleValues }
      : { type: "number" };
  }

  if (allBooleans) {
    return possibleValues
      ? { type: "boolean", possibleValues }
      : { type: "boolean" };
  }

  return possibleValues
    ? { type: "string", possibleValues }
    : { type: "string" };
}

/**
 * Analyze each column of a CSV row by row to determine column types incrementally.
 */
export async function analyzeCSVColumns(
  rows: CSVRow[]
): Promise<Record<string, ColumnTypeInfo>> {
  const columnSamples: Record<string, Set<string>> = {};
  const columnTypes: Record<string, ColumnTypeInfo> = {};

  // Initialize column samples
  if (rows.length > 0) {
    for (const column of Object.keys(rows[0])) {
      columnSamples[column] = new Set();
    }
  }

  // Collect samples
  rows.forEach((row) => {
    Object.keys(row).forEach((column) => {
      columnSamples[column].add(row[column]);
    });
  });

  // Determine column types
  Object.keys(columnSamples).forEach((column) => {
    columnTypes[column] = detectColumnType(columnSamples[column]);
  });

  return columnTypes;
}
export async function guessDelimiter(csv: string): Promise<string | undefined> {
  // Detect the delimiter: try to parse the first 2 lines with different delimiters,
  // keep the one that works for both lines and has the most columns.
  let delimiter: string | undefined = undefined;
  let delimiterColsCount = 0;
  for (const d of [",", ";", "\t"]) {
    const records: unknown[][] = [];
    try {
      const parser = parse(csv, { delimiter: d });
      for await (const record of parser) {
        records.push(record);
        if (records.length == 2) {
          break;
        }
      }
    } catch (e) {
      // Ignore error.
      continue;
    }

    const [firstRecord, secondRecord] = records;
    // Check for more than one line to ensure sufficient data for accurate delimiter detection.
    if (!secondRecord) {
      continue;
    }

    if (!!firstRecord.length && firstRecord.length === secondRecord.length) {
      if (firstRecord.length > delimiterColsCount) {
        delimiterColsCount = firstRecord.length;
        delimiter = d;
      }
    }
  }

  return delimiter;
}
