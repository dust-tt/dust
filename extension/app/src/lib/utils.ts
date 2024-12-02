/**
 * Utils to generate PKCE code verifier and challenge.
 */

import type { LightAgentConfigurationType } from "@dust-tt/client";

const base64URLEncode = (buffer: ArrayBuffer): string => {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
};

const generateCodeVerifier = (): string => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array.buffer);
};

const generateCodeChallenge = async (codeVerifier: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64URLEncode(digest);
};

export const generatePKCE = async (): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> => {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  return { codeVerifier, codeChallenge };
};

/**
 * COPYED FROM FRONT LIB, MAYBE WE SHOULD SHARE THIS CODE
 */

export function classNames(...classes: (string | null | boolean)[]) {
  return classes.filter(Boolean).join(" ");
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

// This function implements our general strategy to sort agents to users (input bar, assistant list,
// agent suggestions...).
export function compareAgentsForSort(
  a: LightAgentConfigurationType,
  b: LightAgentConfigurationType
) {
  // Place favorites first
  if (a.userFavorite && !b.userFavorite) {
    return -1;
  }
  if (b.userFavorite && !a.userFavorite) {
    return 1;
  }
  // Check for 'dust'
  if (a.sId === "dust") {
    return -1;
  }
  if (b.sId === "dust") {
    return 1;
  }

  // Check for 'claude-3'
  if (a.sId === "claude-3-sonnet") {
    return -1;
  }
  if (b.sId === "claude-3-sonnet") {
    return 1;
  }

  // Check for 'gpt4'
  if (a.sId === "gpt-4") {
    return -1;
  }
  if (b.sId === "gpt-4") {
    return 1;
  }

  // Check for agents with non-global 'scope'
  if (a.scope !== "global" && b.scope === "global") {
    return -1;
  }
  if (b.scope !== "global" && a.scope === "global") {
    return 1;
  }

  // default: sort alphabetically
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
}
