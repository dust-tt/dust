import { useTheme } from "@app/components/sparkle/ThemeContext";
import { stripMimeParameters } from "@app/types/files";
import { cn } from "@dust-tt/sparkle";
import type { ColumnRegular, DataType } from "@revolist/react-datagrid";
import { RevoGrid } from "@revolist/react-datagrid";
import { useMemo } from "react";

// RevoGrid virtualizes rendering, so we can preview many more rows than the
// previous hand-rolled table comfortably allowed.
export const MAX_TABULAR_PREVIEW_ROWS = 10_000;

const MAX_COLUMN_WIDTH_PX = 420;
const MIN_COLUMN_WIDTH_PX = 120;
const APPROX_PX_PER_CHAR = 9;
const COLUMN_PADDING_PX = 24;

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
  const rows = rawRows
    .slice(0, MAX_TABULAR_PREVIEW_ROWS)
    .map((row) =>
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

function columnWidthForHeader(header: string): number {
  const estimated = header.length * APPROX_PX_PER_CHAR + COLUMN_PADDING_PX;

  return Math.max(
    MIN_COLUMN_WIDTH_PX,
    Math.min(MAX_COLUMN_WIDTH_PX, estimated)
  );
}

interface TabularFilePreviewProps {
  className?: string;
  content: string;
  mimeType: string;
}

export function TabularFilePreview({
  className,
  content,
  mimeType,
}: TabularFilePreviewProps) {
  const { isDark } = useTheme();

  const table = useMemo(
    () => parseTable(content, mimeType),
    [content, mimeType]
  );

  // Column keys are the (numeric) column indexes, matching how each row is
  // serialized into the data source below.
  const columns = useMemo<ColumnRegular[]>(
    () =>
      table?.headers.map((header, index) => ({
        prop: index,
        name: header,
        size: columnWidthForHeader(header),
      })) ?? [],
    [table]
  );

  const source = useMemo<DataType[]>(
    () =>
      table?.rows.map((row) => {
        const record: Record<number, string> = {};
        row.forEach((cell, index) => {
          record[index] = cell;
        });

        return record;
      }) ?? [],
    [table]
  );

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
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm dark:border-border-night dark:bg-background-night",
        className
      )}
    >
      <RevoGrid
        columns={columns}
        source={source}
        theme={isDark ? "darkCompact" : "compact"}
        readonly
        resize
        rowHeaders
        style={{ flex: "1 1 auto", minHeight: 0, width: "100%" }}
      />
    </div>
  );
}
