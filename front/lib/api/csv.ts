import { parse } from "csv-parse";

const POSSIBLE_VALUES_MAX_LEN = 32;
const POSSIBLE_VALUES_MAX_COUNT = 16;

interface ColumnTypeInfo {
  type: "string" | "number" | "boolean" | "enum";
  possibleValues: string[] | null;
}

interface CSVRow {
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

  if (allNumbers) {
    return { type: "number", possibleValues: null };
  }

  if (allBooleans) {
    return { type: "boolean", possibleValues: null };
  }

  if (
    uniqueValues.size <= POSSIBLE_VALUES_MAX_COUNT &&
    Array.from(uniqueValues).every(
      (value) => value.length <= POSSIBLE_VALUES_MAX_LEN
    )
  ) {
    return { type: "enum", possibleValues: Array.from(uniqueValues) };
  }

  return { type: "string", possibleValues: null };
}

/**
 * Analyze each column of a CSV row by row to determine column types incrementally.
 */
export async function* analyzeCSVColumns(
  source: AsyncIterable<CSVRow>
): AsyncIterable<Record<string, ColumnTypeInfo>> {
  const columnSamples: Record<string, Set<string>> = {};
  const columnTypes: Record<string, ColumnTypeInfo> = {};
  let initialized = false;

  for await (const row of source) {
    if (!initialized) {
      for (const column of Object.keys(row)) {
        columnSamples[column] = new Set();
      }
      initialized = true;
    }

    for (const column of Object.keys(row)) {
      columnSamples[column].add(row[column]);
    }
  }

  for (const column of Object.keys(columnSamples)) {
    columnTypes[column] = detectColumnType(columnSamples[column]);
  }

  yield columnTypes;
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
