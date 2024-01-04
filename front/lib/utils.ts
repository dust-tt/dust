import { AgentConfigurationType } from "@dust-tt/types";
import { hash as blake3 } from "blake3";
import { v4 as uuidv4 } from "uuid";

export const MODELS_STRING_MAX_LENGTH = 255;

export function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export function new_id() {
  const u = uuidv4();
  const b = blake3(u);
  return Buffer.from(b).toString("hex");
}

export function generateModelSId(): string {
  const sId = new_id();
  return sId.slice(0, 10);
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

export const timeAgoFrom = (millisSinceEpoch: number) => {
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
    return years + "y";
  }
  if (months > 0) {
    return months + "m";
  }
  if (days > 0) {
    return days + "d";
  }
  if (hours > 0) {
    return hours + "h";
  }
  if (minutes > 0) {
    return minutes + "m";
  }
  return seconds + "s";
};

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

// Returns true if a is a subsequence of b.
export function subFilter(a: string, b: string) {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
    }
    j++;
  }
  return i === a.length;
}

export function compareForFuzzySort(query: string, a: string, b: string) {
  // Find the index of the token in both strings.
  const indexA = a.toLowerCase().indexOf(query);
  const indexB = b.toLowerCase().indexOf(query);

  // If the token index is the same, compare the strings lexicographically.
  if (indexA === indexB) {
    return a.localeCompare(b);
  }

  // Otherwise, sort based on the index of the token's first occurrence.
  return indexA - indexB;
}

export function filterAndSortAgents(
  agents: AgentConfigurationType[],
  searchText: string
) {
  const lowerCaseSearchText = searchText.toLowerCase();

  const filtered = agents.filter((a) =>
    subFilter(lowerCaseSearchText, a.name.toLowerCase())
  );

  // Sort by position of the subFilter in the name (position of the first character matching).
  if (searchText.length > 0) {
    filtered.sort((a, b) =>
      compareForFuzzySort(lowerCaseSearchText, a.name, b.name)
    );
  }

  return filtered;
}
