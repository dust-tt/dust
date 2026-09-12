// Ports of the front helpers the Manage screens rely on, so search, sorting
// and date rendering behave exactly like in the product.

function subFilterLastIndex(a: string, b: string) {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
    }
    j++;
  }
  return i === a.length ? j : -1;
}

function subFilterFirstIndex(a: string, b: string) {
  let i = a.length - 1;
  let j = b.length - 1;
  while (i >= 0 && j >= 0) {
    if (a[i] === b[j]) {
      i--;
    }
    j--;
  }
  return i === -1 ? j + 1 : -1;
}

function spreadLength(a: string, b: string) {
  const lastIndex = subFilterLastIndex(a, b);
  if (lastIndex === -1) {
    return -1;
  }
  const firstIndex = subFilterFirstIndex(a, b.substring(0, lastIndex));
  return lastIndex - firstIndex;
}

/** True when every character of `a` appears in `b`, in order. */
export function subFilter(a: string, b: string) {
  return subFilterLastIndex(a, b) > -1;
}

export function compareForFuzzySort(query: string, a: string, b: string) {
  const normalizedQuery = query.toLowerCase();
  const normalizedA = a.toLowerCase();
  const normalizedB = b.toLowerCase();

  if (
    normalizedA.includes(normalizedQuery) &&
    !normalizedB.includes(normalizedQuery)
  ) {
    return -1;
  }
  if (
    normalizedB.includes(normalizedQuery) &&
    !normalizedA.includes(normalizedQuery)
  ) {
    return 1;
  }

  const spreadA = spreadLength(normalizedQuery, normalizedA);
  if (spreadA === -1) {
    return 1;
  }

  const spreadB = spreadLength(normalizedQuery, normalizedB);
  if (spreadB === -1) {
    return -1;
  }

  if (spreadA !== spreadB) {
    return spreadA - spreadB;
  }

  const isExactMatchA = normalizedA === normalizedQuery;
  const isExactMatchB = normalizedB === normalizedQuery;
  if (isExactMatchA && !isExactMatchB) {
    return -1;
  }
  if (isExactMatchB && !isExactMatchA) {
    return 1;
  }

  return 0;
}

export function formatTimestampToFriendlyDate(
  timestamp: number,
  version: "long" | "short" | "compact" | "compactWithDay" = "long"
): string {
  const date = new Date(timestamp);

  switch (version) {
    case "compact":
      return date
        .toLocaleDateString("en-US", { month: "short", year: "numeric" })
        .replace(" ", ", ");
    case "short":
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    case "compactWithDay":
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    default:
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      });
  }
}

export function pluralize(count: number) {
  return count === 1 ? "" : "s";
}

export function assistantUsageMessage({
  usage,
}: {
  usage: { messageCount: number; timePeriodSec: number } | null;
}): string {
  if (!usage) {
    return "";
  }
  const days = usage.timePeriodSec / (60 * 60 * 24);
  const nb = usage.messageCount || 0;
  return `${nb} message${pluralize(nb)} over the last ${days} days`;
}
