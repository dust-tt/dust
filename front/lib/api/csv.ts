import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify";
import { stringify as stringifySync } from "csv-stringify/sync";

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
