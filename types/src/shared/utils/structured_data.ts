import { parse } from "csv-parse";
import { stringify } from "csv-stringify";

import { Err, Ok, Result } from "../result";
import { slugify } from "./string_utils";

export class InvalidStructuredDataHeaderError extends Error {}
class ParsingCsvError extends Error {}

export function getSanitizedHeaders(
  rawHeaders: string[]
): Result<string[], Error> {
  try {
    const value = rawHeaders.reduce<string[]>((acc, curr) => {
      // Special case for __dust_id, which is a reserved header name that we use
      // to assign unique row_id to make incremental row updates possible.
      const slugifiedName = curr === "__dust_id" ? curr : slugify(curr);

      if (!acc.includes(slugifiedName) || !slugifiedName.length) {
        acc.push(slugifiedName);
      } else {
        let conflictResolved = false;
        for (let i = 2; i < 64; i++) {
          if (!acc.includes(slugify(`${slugifiedName}_${i}`))) {
            acc.push(slugify(`${slugifiedName}_${i}`));
            conflictResolved = true;
            break;
          }
        }

        if (!conflictResolved) {
          throw new InvalidStructuredDataHeaderError(
            `Failed to generate unique slugified name for header "${curr}" after multiple attempts.`
          );
        }
      }
      return acc;
    }, []);
    return new Ok(value);
  } catch (e) {
    if (e instanceof Error) {
      return new Err(e);
    } else {
      return new Err(new Error("An unknown error occurred"));
    }
  }
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
        if (records.length === 2) {
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

export async function parseAndStringifyCsv(tableCsv: string): Promise<string> {
  const delimiter = await guessDelimiter(tableCsv);

  const records: unknown[] = [];

  try {
    const parser = parse(tableCsv, {
      delimiter,
      columns: (c) => c,
    });

    for await (const record of parser) {
      records.push(record);
    }
  } catch (err) {
    throw new ParsingCsvError("Unable to parse CSV string");
  }

  return new Promise((resolve, reject) => {
    stringify(records, { header: true }, (err, output) => {
      if (err) {
        reject(new ParsingCsvError("Unable to stringify parsed CSV data"));
      } else {
        resolve(output);
      }
    });
  });
}
