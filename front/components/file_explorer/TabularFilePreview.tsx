import { stripMimeParameters } from "@app/types/files";
import { cn } from "@dust-tt/sparkle";

export const MAX_TABULAR_PREVIEW_ROWS = 200;

const MAX_COLUMN_WIDTH_CHARS = 48;
const MIN_COLUMN_WIDTH_CHARS = 12;

type ParsedTable = {
  headers: string[];
  rows: string[][];
  totalRows: number;
  isTruncated: boolean;
};

function getPreferredDelimiter(content: string, mimeType: string): string {
  const normalizedMimeType = stripMimeParameters(mimeType);
  if (
    normalizedMimeType === "text/tsv" ||
    normalizedMimeType === "text/tab-separated-values"
  ) {
    return "\t";
  }

  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];

  let bestDelimiter = ",";
  let bestCount = -1;

  for (const delimiter of candidates) {
    let count = 0;
    let inQuotes = false;

    for (let i = 0; i < firstLine.length; i++) {
      const char = firstLine[i];
      if (char === '"') {
        if (inQuotes && firstLine[i + 1] === '"') {
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        count++;
      }
    }

    if (count > bestCount) {
      bestCount = count;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

function parseDelimitedRows(content: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let inQuotes = false;

  const pushValue = () => {
    row.push(value);
    value = "";
  };

  const pushRow = () => {
    pushValue();
    if (row.some((cell) => cell.trim() !== "")) {
      rows.push(row);
    }
    row = [];
  };

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      pushValue();
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && content[i + 1] === "\n") {
        i++;
      }
      pushRow();
    } else {
      value += char;
    }
  }

  if (value !== "" || row.length > 0) {
    pushRow();
  }

  return rows;
}

function normalizeHeaders(headers: string[], columnCount: number): string[] {
  const seen = new Map<string, number>();

  return Array.from({ length: columnCount }, (_, index) => {
    const rawHeader = headers[index]?.trim() || `Column ${index + 1}`;
    const previousCount = seen.get(rawHeader) ?? 0;
    seen.set(rawHeader, previousCount + 1);

    return previousCount === 0
      ? rawHeader
      : `${rawHeader} (${previousCount + 1})`;
  });
}

function parseTable(content: string, mimeType: string): ParsedTable | null {
  const delimiter = getPreferredDelimiter(content, mimeType);
  const records = parseDelimitedRows(content, delimiter);

  if (records.length === 0) {
    return null;
  }

  const [rawHeaders, ...rawRows] = records;
  const columnCount = Math.max(
    rawHeaders?.length ?? 0,
    ...rawRows.map((row) => row.length)
  );

  if (columnCount === 0) {
    return null;
  }

  const headers = normalizeHeaders(rawHeaders ?? [], columnCount);
  const rows = rawRows.slice(0, MAX_TABULAR_PREVIEW_ROWS).map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? "")
  );

  return {
    headers,
    rows,
    totalRows: rawRows.length,
    isTruncated: rawRows.length > MAX_TABULAR_PREVIEW_ROWS,
  };
}

export function getTabularPreviewStats({
  content,
  mimeType,
}: {
  content: string;
  mimeType: string;
}): { displayed: number; total: number; isTruncated: boolean } | null {
  const table = parseTable(content, mimeType);
  if (!table) {
    return null;
  }

  return {
    displayed: table.rows.length,
    total: table.totalRows,
    isTruncated: table.isTruncated,
  };
}

export function TabularFilePreview({
  className,
  content,
  mimeType,
}: {
  className?: string;
  content: string;
  mimeType: string;
}) {
  const table = parseTable(content, mimeType);

  if (!table || table.totalRows === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-muted-background text-sm text-muted-foreground dark:border-border-night dark:bg-muted-background-night dark:text-muted-foreground-night">
        No data to preview.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-background shadow-sm dark:border-border-night dark:bg-background-night",
        className
      )}
    >
      <table className="border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-30 w-12 border-b border-r border-border bg-muted-background px-3 py-2 text-right text-xs font-medium text-muted-foreground dark:border-border-night dark:bg-muted-background-night dark:text-muted-foreground-night">
              #
            </th>
            {table.headers.map((header, index) => (
              <th
                key={`${header}-${index}`}
                className="sticky top-0 z-20 border-b border-r border-border bg-muted-background px-3 py-2 text-xs font-semibold text-foreground dark:border-border-night dark:bg-muted-background-night dark:text-foreground-night"
                style={{
                  minWidth: `${Math.max(
                    MIN_COLUMN_WIDTH_CHARS,
                    Math.min(MAX_COLUMN_WIDTH_CHARS, header.length + 4)
                  )}ch`,
                }}
                title={header}
              >
                <div className="max-w-80 truncate">{header}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="odd:bg-background even:bg-muted-background/40 dark:odd:bg-background-night dark:even:bg-muted-background-night/30"
            >
              <th className="sticky left-0 z-10 border-b border-r border-border bg-inherit px-3 py-2 text-right text-xs font-medium text-muted-foreground dark:border-border-night dark:text-muted-foreground-night">
                {rowIndex + 1}
              </th>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="max-w-80 border-b border-r border-border px-3 py-2 align-top text-foreground dark:border-border-night dark:text-foreground-night"
                  title={cell}
                >
                  <div className="max-h-24 overflow-hidden whitespace-pre-wrap break-words leading-5">
                    {cell}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
