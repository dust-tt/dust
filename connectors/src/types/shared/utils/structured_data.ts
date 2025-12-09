import { CsvError, parse } from "csv-parse";
import { stringify } from "csv-stringify";

export class InvalidStructuredDataHeaderError extends Error {}
class ParsingCsvError extends Error {}

const _POSSIBLE_DELIMITERS = [",", ";", "\t"];

/**
 * Detect the delimiter: try to parse the first 2 lines with different delimiters,
 * keep the one that works for both lines and has the most columns.
 */
async function guessDelimiter(
  csv: string
): Promise<{ delimiter: string | undefined; oneLineCsv: boolean }> {
  let delimiter: string | undefined = undefined;
  let delimiterColsCount = 0;
  let oneLineCsv = false;

  // Try to parse first 8 lines with each delimiter
  for (const d of _POSSIBLE_DELIMITERS) {
    const records: unknown[][] = [];
    try {
      // We parse at most 8 lines with skipEmptyLines with the goal of getting 2 valid ones,
      // otherwise let's consider the file as broken beyond repair.
      const parser = parse(csv, {
        bom: true, // Remove BOM if present, useful for UTF-8/16 files.
        delimiter: d,
        to: 8,
        skipEmptyLines: true,
      });
      for await (const record of parser) {
        records.push(record);
        if (records.length === 2) {
          break;
        }
      }
    } catch (e) {
      // Ignore error.
      continue;
    }

    const [firstRecord, secondRecord] = records;

    // If we have 2 records with matching column counts
    if (
      firstRecord &&
      secondRecord &&
      firstRecord.length === secondRecord.length &&
      firstRecord.length > delimiterColsCount
    ) {
      delimiterColsCount = firstRecord.length;
      delimiter = d;
    }

    // If only 1 record exists, use statistical analysis as fallback
    if (firstRecord && !secondRecord && !delimiter) {
      // Count occurrences in the first line
      const firstLine = csv.split("\n")[0] || "";
      const count = (firstLine.match(new RegExp(`\\${d}`, "g")) || []).length;
      if (count > 0 && count > delimiterColsCount) {
        delimiterColsCount = count;
        delimiter = d;
        oneLineCsv = true;
      }
    }
  }

  return { delimiter, oneLineCsv };
}

// This function is used by connectors to turn a , ; \t separated file into a comma-separated file.
// It also will raise if the file can't be parsed.
export async function parseAndStringifyCsv(tableCsv: string): Promise<string> {
  const guessedDelimiter = await guessDelimiter(tableCsv);
  const records: unknown[] = [];

  if (!guessedDelimiter.delimiter) {
    throw new ParsingCsvError("Unable to detect CSV delimiter");
  }

  try {
    const parser = parse(tableCsv, {
      bom: true, // Remove BOM if present, useful for UTF-8/16 files.
      delimiter: guessedDelimiter.delimiter,
      skipEmptyLines: true,
      columns: !guessedDelimiter.oneLineCsv,
    });

    for await (const record of parser) {
      records.push(record);
    }
  } catch (err) {
    throw new ParsingCsvError(
      err instanceof CsvError
        ? `Unable to parse CSV string : ${err.message}`
        : "Unable to parse CSV string"
    );
  }

  return new Promise((resolve, reject) => {
    stringify(
      records,
      { header: !guessedDelimiter.oneLineCsv, delimiter: "," },
      (err, output) => {
        if (err) {
          reject(new ParsingCsvError("Unable to stringify parsed CSV data"));
        } else {
          resolve(output);
        }
      }
    );
  });
}
