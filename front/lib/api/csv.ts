import { parse } from "csv-parse";

const POSSIBLE_VALUES_MAX_LEN = 32;
const POSSIBLE_VALUES_MAX_COUNT = 16;

interface ColumnTypeInfo {
  type: "string" | "number" | "boolean" | "enum";
  possibleValues: string[] | null;
}

export interface CSVRow {
  [key: string]: string;
}

/**
 * Detect the type of a column based on its values.
 */
function detectColumnType(columnValues: string[]): ColumnTypeInfo {
  const uniqueValues = new Set(columnValues);

  if (columnValues.every((value) => !isNaN(Number(value)))) {
    return { type: "number", possibleValues: null };
  }

  if (
    columnValues.every(
      (value) =>
        value.toLowerCase() === "true" || value.toLowerCase() === "false"
    )
  ) {
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
 * Analyze the columns of a CSV file and return the type of each column.
 */
export function analyzeCSVColumns(
  csvData: CSVRow[]
): Record<string, ColumnTypeInfo> {
  const columnTypes: Record<string, ColumnTypeInfo> = {};
  const columns = Object.keys(csvData[0]);

  for (const column of columns) {
    const columnValues = csvData.map((row) => row[column]);
    columnTypes[column] = detectColumnType(columnValues);
  }

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
