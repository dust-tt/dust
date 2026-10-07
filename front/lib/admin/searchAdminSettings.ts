import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { messages as defaultLocaleMessages } from "@app/locales/en-US.catalog";
import { DEFAULT_LOCALE } from "@app/types/locale";
import type { MessageDescriptor } from "@lingui/core";
import { setupI18n } from "@lingui/core";

const defaultLocaleI18n = setupI18n({
  locale: DEFAULT_LOCALE,
  messages: { [DEFAULT_LOCALE]: defaultLocaleMessages },
});

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
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
/**
 * @cc [owner:sfriquet,label:product] match-translated-and-english
 * An entry's label and keywords MUST match a query both as translated by `t` and in
 * `DEFAULT_LOCALE`, so that English queries keep finding settings whatever the active locale.
 */
export function searchAdminSettings(
  index: AdminSettingEntry[],
  query: string,
  pageLabel: (pageId: string) => string,
  t: (descriptor: MessageDescriptor) => string
): AdminSettingEntry[] {
  const tokens = norm(query).split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }

  const translations = (descriptor: MessageDescriptor | undefined) =>
    descriptor
      ? [norm(t(descriptor)), norm(defaultLocaleI18n._(descriptor))]
      : [];

  const scored = index
    .map((entry) => {
      const labels = translations(entry.label);
      const label = labels.join(" ");
      const hay = `${label} ${translations(entry.keywords).join(" ")} ${norm(entry.sectionId)} ${norm(pageLabel(entry.pageId))}`;
      if (!tokens.every((token) => tokenMatches(hay, token))) {
        return null;
      }
      const score =
        tokens.filter((token) => tokenMatches(label, token)).length * 2 +
        (labels.some((l) => l.startsWith(tokens[0])) ? 1 : 0);
      return { entry, score };
    })
    .filter(
      (x): x is { entry: AdminSettingEntry; score: number } => x !== null
    );

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 20).map((x) => x.entry);
}
