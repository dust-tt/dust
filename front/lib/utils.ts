import isEqual from "lodash/isEqual";

import type { LightAgentConfigurationType } from "@app/types";
import { isDevelopment } from "@app/types";
import type { TagType } from "@app/types/tag";

export const MODELS_STRING_MAX_LENGTH = 255;

export function getFaviconPath(): string {
  return isDevelopment() ? "/static/local_favicon.png" : "/static/favicon.png";
}

export function classNames(...classes: (string | null | boolean)[]) {
  return classes.filter(Boolean).join(" ");
}

export const shallowBlockClone = (block: any) => {
  const b = Object.assign({}, block);
  b.spec = Object.assign({}, block.spec);
  b.config = Object.assign({}, block.config || {});
  return b;
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

  return "<1m";
};

export function getWeekBoundaries(date: Date): {
  startDate: Date;
  endDate: Date;
} {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  const diff =
    startDate.getDate() -
    startDate.getDay() +
    (startDate.getDay() === 0 ? -6 : 1);
  startDate.setDate(diff);

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 7);

  return { startDate, endDate };
}

export function formatTimestampToFriendlyDate(
  timestamp: number,
  version: "long" | "short" | "compact" = "long"
): string {
  const date = new Date(timestamp);

  switch (version) {
    case "compact":
      return date
        .toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        })
        .replace(" ", ", ");

    case "short":
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

    case "long":
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

export const isDomain = (domain: string | null): boolean => {
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

export const tagsSorter = (a: TagType, b: TagType) => {
  if (a.kind !== b.kind) {
    return a.kind.localeCompare(b.kind);
  }
  return a.name.localeCompare(b.name);
};

/**
 * Gets a string to use when filtering agents by name, description, and last authors.
 */
export const getAgentSearchString = (
  assistant: LightAgentConfigurationType
) => {
  return (
    assistant.name.toLowerCase() +
    " " +
    assistant.editors
      ?.map((e) => e.fullName)
      .join(" ")
      .toLowerCase()
  );
};

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

export function removeDiacritics(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Compares two 2D arrays for equality, ignoring the order of elements.
 * Does not mutate input arrays.
 */
export function isArrayEqual2DUnordered(
  first: unknown[][],
  second: unknown[][]
): boolean {
  if (first.length !== second.length) {
    return false;
  }

  // Sort both arrays and their inner arrays.
  const sort2D = (arr: unknown[][]) =>
    [...arr].map((row) => [...row].sort()).sort();

  return isEqual(sort2D(first), sort2D(second));
}

// Postgres requires all subarrays to be of the same length.
// This function ensures that all subarrays are of the same length
// by repeating the last element of each subarray until all subarrays have the same length.
// Make sure that it's okay to use this function for your use case.
export function normalizeArrays<T>(array2D: T[][]): T[][] {
  // Copy the array to avoid mutating the original array.
  const array2DCopy = array2D.map((array) => [...array]);

  const longestArray = array2DCopy.reduce(
    (max, req) => Math.max(max, req.length),
    0
  );
  // for each array, repeatedly add the last id until array is of longest array length
  const updatedArrays = array2DCopy.map((array) => {
    while (array.length < longestArray) {
      array.push(array[array.length - 1]);
    }
    return array;
  });

  return updatedArrays;
}

// from http://detectmobilebrowsers.com/
export const isMobile = (navigator: Navigator) =>
  /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(
    navigator.userAgent || navigator.vendor
  ) ||
  /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw-(n|u)|c55\/|capi|ccwa|cdm-|cell|chtm|cldc|cmd-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc-s|devi|dica|dmob|do(c|p)o|ds(12|-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(-|_)|g1 u|g560|gene|gf-5|g-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd-(m|p|t)|hei-|hi(pt|ta)|hp( i|ip)|hs-c|ht(c(-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i-(20|go|ma)|i230|iac( |-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|-[a-w])|libw|lynx|m1-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|-([1-8]|c))|phil|pire|pl(ay|uc)|pn-2|po(ck|rt|se)|prox|psio|pt-g|qa-a|qc(07|12|21|32|60|-[2-7]|i-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h-|oo|p-)|sdk\/|se(c(-|0|1)|47|mc|nd|ri)|sgh-|shar|sie(-|m)|sk-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h-|v-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl-|tdg-|tel(i|m)|tim-|t-mo|to(pl|sh)|ts(70|m-|m3|m5)|tx-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas-|your|zeto|zte-/i.test(
    (navigator.userAgent || navigator.vendor).substr(0, 4)
  );

/**
 * Bridge a push-based callback to a pull-based `.next()` promise stream.
 */
export type CallbackReader<T> = {
  /** Push endpoint fed by the producer (e.g. Redis subscription). */
  callback: (v: T) => void;
  /** Pull endpoint for the consumer; resolves with the next value. */
  next(): Promise<T>;
};

export function createCallbackReader<T>(): CallbackReader<T> {
  const buffered: T[] = []; // arrived but unconsumed values
  let waiterResolver: ((v: T) => void) | undefined; // pending `.next()` resolver
  let waiterPromise: Promise<T> | undefined; // pending `.next()` promise

  return {
    callback: (v: T) => {
      // If we already have a waiter on the next callback, resolve it.
      if (waiterResolver) {
        waiterResolver(v);
        waiterResolver = undefined;
        waiterPromise = undefined;
      } else {
        // Otherwise, buffer the value.
        buffered.push(v);
      }
    },

    next: () => {
      // If we have buffered values, return the first one.
      const v = buffered.shift();
      if (v !== undefined) {
        return Promise.resolve(v);
      }

      // If we already have a waiter on the next callback, return the same promise.
      if (waiterPromise) {
        return waiterPromise;
      }

      // Otherwise, create a new promise and queue its resolver.
      const promise = new Promise<T>((resolve) => {
        waiterResolver = resolve;
      });

      waiterPromise = promise;

      return promise;
    },
  };
}
