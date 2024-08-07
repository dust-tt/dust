import type { LightAgentConfigurationType } from "@dust-tt/types";
import { v4 as uuidv4 } from "uuid";

export const MODELS_STRING_MAX_LENGTH = 255;

export function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export function client_side_new_id() {
  // blake3 is not available in the browser
  // remove the dashes from the uuid
  const u = uuidv4().replace(/-/g, "");
  // return the last 10 characters of the uuid
  return u.substring(u.length - 10);
}

export const shallowBlockClone = (block: any) => {
  const b = Object.assign({}, block);
  b.spec = Object.assign({}, block.spec);
  b.config = Object.assign({}, block.config || {});
  return b;
};

export const utcDateFrom = (millisSinceEpoch: number | string | Date) => {
  const d = new Date(millisSinceEpoch);
  return d.toUTCString();
};

function maybePlural(unit: number, label: string) {
  return `${label}${unit > 1 ? "s" : ""}`;
}

export const timeAgoFrom = (
  millisSinceEpoch: number,
  { useLongFormat = false }: { useLongFormat?: boolean } = {}
) => {
  // return the duration elapsed from the given time to now in human readable format (using seconds, minutes, days)
  const now = new Date().getTime();
  const diff = now - millisSinceEpoch;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  if (years > 0) {
    return `${years}${useLongFormat ? maybePlural(years, " year") : "y"}`;
  }
  if (months > 0) {
    return `${months}${useLongFormat ? maybePlural(months, " month") : "m"}`;
  }
  if (days > 0) {
    return `${days}${useLongFormat ? maybePlural(days, " day") : "d"}`;
  }
  if (hours > 0) {
    return `${hours}${useLongFormat ? maybePlural(hours, " hour") : "h"}`;
  }
  if (minutes > 0) {
    return `${minutes}${
      useLongFormat ? maybePlural(minutes, " minute") : "min"
    }`;
  }
  return seconds + "s";
};

// E.g: January 25, 2024, 5:17:00 PM.
export function formatTimestampToFriendlyDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
}

export const validateUrl = (
  urlString: string
): {
  valid: boolean;
  standardized: string | null;
} => {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch (e) {
    return { valid: false, standardized: null };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { valid: false, standardized: null };
  }

  return { valid: true, standardized: url.href };
};

// from http://emailregex.com/
const EMAIL_REGEX =
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export const isEmailValid = (email: string | null): boolean => {
  if (!email) {
    return false;
  }
  return EMAIL_REGEX.test(email);
};

const DOMAIN_REGEX =
  /^(((?!-))(xn--|_)?[a-z0-9-]{0,61}[a-z0-9]{1,1}\.)*(xn--)?([a-z0-9][a-z0-9-]{0,60}|[a-z0-9-]{1,30}\.[a-z]{2,})$/;

export const isADomain = (domain: string | null): boolean => {
  if (!domain) {
    return false;
  }
  return DOMAIN_REGEX.test(domain);
};

export const objectToMarkdown = (obj: any, indent = 0) => {
  let markdown = "";

  for (const key in obj) {
    if (typeof obj[key] === "object") {
      markdown += `${"  ".repeat(indent)}- **${key}**:\n${objectToMarkdown(
        obj[key],
        indent + 1
      )}`;
    } else {
      markdown += `${"  ".repeat(indent)}- **${key}**: ${obj[key]}\n`;
    }
  }

  return markdown;
};

/**
 * Checks if a is a subfilter of b, i.e. all characters in a are present in b in
 * the same order, and returns the smallest index of the last character of a in
 * b.
 */
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

/**
 * Checks if a is a subfilter of b, i.e. all characters in a are present in b in
 * the same order, and returns the biggest index of the first character of a in b.
 */
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

/* Measures how much string a is 'spread out' in string b, assuming a is a
 * subfilter of b;  e.g.
 * - 'god' in 'sqlGod': spread is 3 (index of d minus index of g in 'sqlGod')
 * - 'gp4' in 'gpt-4': spread is 5
 * - 'gp4' in 'gemni-pro4': spread is 10
 *
 *  If a is not a subfilter of b, returns -1. If a can be considered "spread" in
 *  multiple places in b, returns the minimal spread for the first occurrence.
 */
function spreadLength(a: string, b: string) {
  const lastIndex = subFilterLastIndex(a, b);
  if (lastIndex === -1) {
    return -1;
  }

  const firstIndex = subFilterFirstIndex(a, b.substring(0, lastIndex));

  return lastIndex - firstIndex;
}

/**
 * Returns true if a is a subfilter of b, i.e. all characters in a are present
 * in b in the same order.
 */
export function subFilter(a: string, b: string) {
  return subFilterLastIndex(a, b) > -1;
}

/**
 * Compares two strings for fuzzy sorting against a query First sort by spread
 * of subfilter, then by first index of subfilter, then length, then by
 * lexicographic order
 */
export function compareForFuzzySort(query: string, a: string, b: string) {
  const spreadA = spreadLength(query, a);
  if (spreadA === -1) {
    return 1;
  }

  const spreadB = spreadLength(query, b);
  if (spreadB === -1) {
    return -1;
  }

  if (spreadA !== spreadB) {
    return spreadA - spreadB;
  }

  const subFilterLastIndexA = subFilterLastIndex(query, a);
  const subFilterLastIndexB = subFilterLastIndex(query, b);
  if (subFilterLastIndexA !== subFilterLastIndexB) {
    return subFilterLastIndexA - subFilterLastIndexB;
  }

  if (a.length !== b.length) {
    return a.length - b.length;
  }
  return a.localeCompare(b);
}

export function filterAndSortAgents(
  agents: LightAgentConfigurationType[],
  searchText: string
) {
  const lowerCaseSearchText = searchText.toLowerCase();

  const filtered = agents.filter((a) =>
    subFilter(lowerCaseSearchText, a.name.toLowerCase())
  );

  if (searchText.length > 0) {
    filtered.sort((a, b) =>
      compareForFuzzySort(lowerCaseSearchText, a.name, b.name)
    );
  }

  return filtered;
}

export function trimText(text: string, maxLength = 20, removeNewLines = true) {
  const t = removeNewLines ? text.replaceAll("\n", " ") : text;
  return t.length > maxLength ? t.substring(0, maxLength) + "..." : t;
}

export function sanitizeJSONOutput(obj: unknown): unknown {
  if (typeof obj === "string") {
    // eslint-disable-next-line no-control-regex
    return obj.replace(/\x00/g, "");
  } else if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeJSONOutput(item));
  } else if (typeof obj === "object" && obj !== null) {
    const sanitizedObj: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      sanitizedObj[key] = sanitizeJSONOutput(
        (obj as Record<string, unknown>)[key] as unknown
      );
    }
    return sanitizedObj;
  }
  return obj;
}
