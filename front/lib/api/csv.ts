import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify";
import { stringify as stringifySync } from "csv-stringify/sync";

const POSSIBLE_VALUES_MAX_LEN = 32;
const POSSIBLE_VALUES_MAX_COUNT = 16;

interface ColumnTypeInfo {
  type: "string" | "number" | "boolean";
  possibleValues?: string[];
}

export interface CSVRow {
  [key: string]: string;
}

export type CSVRecord = Record<
  string,
  string | number | boolean | null | undefined
>;

export const toCsv = (
  records: Array<CSVRecord>,
  options: { header: boolean } = { header: true }
): Promise<string> => {
  return new Promise((resolve, reject) => {
    stringify(records, options, (err, data) => {
      if (err) {
        reject(err);
      }
      resolve(data);
    });
  });
};

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
function analyzeCSVColumns(rows: CSVRow[]): Record<string, ColumnTypeInfo> {
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

export function generateCSVSnippet({
  content,
  totalRecords,
}: {
  content: string;
  totalRecords: number;
}): string {
  // Max number of characters in the snippet.
  const MAX_SNIPPET_CHARS = 16384;

  if (!content || content.trim() === "" || totalRecords === 0) {
    return "TOTAL_LINES: 0\n(empty result set)\n";
  }

  const records = parse(content, {
    columns: true,
    skip_empty_lines: false,
    trim: true,
    to: 256, // Limit the number of records to parse
  });

  if (!records || !records.length) {
    return "TOTAL_LINES: 0\n(empty result set)\n";
  }

  let snippetOutput = `TOTAL_LINES: ${totalRecords}\n`;
  let currentCharCount = snippetOutput.length;
  let linesIncluded = 0;

  const truncationString = `(...truncated)`;
  const endOfSnippetString = (omitted: number) =>
    omitted > 0 ? `\n(${omitted} lines omitted)\n` : `\n(end of file)\n`;

  // Process header
  const header = stringifySync([records[0]], { header: true }).split("\n")[0];
  if (currentCharCount + header.length + 1 <= MAX_SNIPPET_CHARS) {
    snippetOutput += header + "\n";
    currentCharCount += header.length + 1;
  } else {
    const remainingChars =
      MAX_SNIPPET_CHARS - currentCharCount - truncationString.length;
    if (remainingChars > 0) {
      snippetOutput += header.slice(0, remainingChars) + truncationString;
    }
    snippetOutput += endOfSnippetString(totalRecords);
    return snippetOutput;
  }

  // Process data rows
  for (const row of records) {
    const rowCsv = stringifySync([row], { header: false });
    const trimmedRowCsv = rowCsv.trim(); // Remove trailing newline
    if (currentCharCount + trimmedRowCsv.length + 1 <= MAX_SNIPPET_CHARS) {
      snippetOutput += trimmedRowCsv + "\n";
      currentCharCount += trimmedRowCsv.length + 1;
      linesIncluded++;
    } else {
      const remainingChars =
        MAX_SNIPPET_CHARS - currentCharCount - truncationString.length;
      if (remainingChars > 0) {
        snippetOutput +=
          trimmedRowCsv.slice(0, remainingChars) + truncationString;
        linesIncluded++;
      }
      break;
    }
  }

  const linesOmitted = totalRecords - linesIncluded;
  snippetOutput += endOfSnippetString(linesOmitted);

  return snippetOutput;
}
