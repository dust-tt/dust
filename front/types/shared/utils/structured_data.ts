import { parse } from "csv-parse";

export async function guessDelimiter(csv: string): Promise<string | undefined> {
  // Detect the delimiter: try to parse the first 2 lines with different delimiters,
  // keep the one that works for both lines and has the most columns.
  let delimiter: string | undefined = undefined;
  let delimiterColsCount = 0;
  for (const d of [",", ";", "\t"]) {
    const records: unknown[][] = [];
    try {
      // We parse at most 8 lines with skipEmptyLines with the goal of getting 2 valid ones,
      // otherwise let's consider the file as broken beyond repair.
      const parser = parse(csv, { delimiter: d, to: 8, skipEmptyLines: true });
      for await (const record of parser) {
        records.push(record);
        if (records.length === 2) {
          break;
        }
      }
    } catch {
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
