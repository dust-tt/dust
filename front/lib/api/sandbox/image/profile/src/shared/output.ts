import { MAX_OUTPUT_BYTES, MAX_OUTPUT_LINES } from "../constants";

function splitOutputLines(text: string): string[] {
  if (!text) {
    return [];
  }

  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

export function countOutputLines(text: string): number {
  return splitOutputLines(text).length;
}

export function safeOutput(
  text: string,
  options?: { maxBytes?: number; maxLines?: number }
): {
  text: string;
  wasTruncated: boolean;
} {
  const maxBytes = options?.maxBytes ?? MAX_OUTPUT_BYTES;
  const maxLines = options?.maxLines ?? MAX_OUTPUT_LINES;
  const lines = splitOutputLines(text);

  if (lines.length <= maxLines && Buffer.byteLength(text, "utf8") <= maxBytes) {
    return { text, wasTruncated: false };
  }

  const keptLines: string[] = [];
  let byteCount = 0;

  for (const [index, line] of lines.entries()) {
    if (index >= maxLines) {
      return { text: keptLines.join("\n"), wasTruncated: true };
    }

    const lineBytes = Buffer.byteLength(`${line}\n`, "utf8");
    if (byteCount + lineBytes > maxBytes) {
      return { text: keptLines.join("\n"), wasTruncated: true };
    }

    keptLines.push(line);
    byteCount += lineBytes;
  }

  return { text: keptLines.join("\n"), wasTruncated: false };
}

export function paginate<T>(
  items: readonly T[],
  offset: number,
  limit: number
): {
  page: T[];
  total: number;
  hasMore: boolean;
} {
  const total = items.length;
  const page = items.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return { page, total, hasMore };
}

function nextOffsetForPage(offset: number, shown: number): number {
  return offset + Math.max(shown, 1);
}

function formatPaginationFooter(
  shown: number,
  offset: number,
  noun: string
): string {
  return `[${shown} ${noun} shown. More results available. Next offset: ${nextOffsetForPage(
    offset,
    shown
  )}]`;
}

export function printPaginatedOutput(
  page: readonly string[],
  offset: number,
  hasMore: boolean,
  noun: string
): void {
  const outputText = page.join("\n");
  const { text, wasTruncated } = safeOutput(outputText);
  const shown = countOutputLines(text);

  if (text) {
    process.stdout.write(text);
    process.stdout.write("\n");
  }

  if (hasMore || wasTruncated) {
    if (text) {
      process.stdout.write("\n");
    }
    process.stdout.write(`${formatPaginationFooter(shown, offset, noun)}\n`);
  }
}
