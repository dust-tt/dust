import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9@]+/g, " ")
    .trim();

/**
 * A token matches if it, or a prefix of it (down to 3 chars, at most 3 chars
 * shorter), appears in the haystack.
 */
function tokenMatches(hay: string, token: string) {
  for (let len = token.length; len >= Math.max(3, token.length - 3); len--) {
    if (hay.includes(token.slice(0, len))) {
      return true;
    }
  }
  return token.length < 3 && hay.includes(token);
}

/**
 * Rank admin settings against a free-text query. Label hits rank above
 * keyword-only hits. Returns at most 20 entries.
 */
export function searchAdminSettings(
  index: AdminSettingEntry[],
  query: string,
  pageLabel: (pageId: string) => string
): AdminSettingEntry[] {
  const tokens = norm(query).split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }

  const scored = index
    .map((entry) => {
      const label = norm(entry.label);
      const hay = `${label} ${norm(entry.keywords ?? "")} ${norm(entry.sectionId)} ${norm(pageLabel(entry.pageId))}`;
      if (!tokens.every((t) => tokenMatches(hay, t))) {
        return null;
      }
      const score =
        tokens.filter((t) => tokenMatches(label, t)).length * 2 +
        (label.startsWith(tokens[0]) ? 1 : 0);
      return { entry, score };
    })
    .filter(
      (x): x is { entry: AdminSettingEntry; score: number } => x !== null
    );

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 20).map((x) => x.entry);
}
