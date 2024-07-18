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
export function analyzeCSVColumns(
  rows: CSVRow[]
): Record<string, ColumnTypeInfo> {
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
