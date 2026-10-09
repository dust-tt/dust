import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";

/** Build a deep link to an admin setting (optional `?tab=` + `#sectionId`). */
export function buildAdminSettingHref(
  pageHref: string,
  entry: Pick<AdminSettingEntry, "tab" | "sectionId">
): string {
  const [path, existingQuery = ""] = pageHref.split("?");
  // A tab deep link replaces the page's query rather than merging into it.
  const params = new URLSearchParams(entry.tab ? "" : existingQuery);
  if (entry.tab) {
    params.set("tab", entry.tab);
  }
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}#${entry.sectionId}`;
}

function assertHashForHighlight(sectionId: string): void {
  const nextHash = `#${sectionId}`;
  // Clearing first guarantees a `hashchange` even when the hash is unchanged.
  if (window.location.hash === nextHash) {
    window.location.hash = "";
  }
  window.location.hash = sectionId;
}

/**
 * Navigate to an admin setting. Same-page jumps set `location.hash` so the
 * highlight hook's `hashchange` listener re-runs (React Router hash updates
 * use pushState and do not fire `hashchange`).
 */
export function navigateToAdminSetting(
  push: (href: string) => void,
  pageHref: string,
  entry: Pick<AdminSettingEntry, "tab" | "sectionId">
): void {
  const href = buildAdminSettingHref(pageHref, entry);
  const target = new URL(href, window.location.origin);
  const samePathname = target.pathname === window.location.pathname;
  const samePage = samePathname && target.search === window.location.search;

  if (samePage) {
    assertHashForHighlight(entry.sectionId);
    return;
  }

  push(href);

  // Same pathname + different search (e.g. Credits `?tab=`) keeps the page
  // mounted, so the highlight effect does not re-run and RR won't emit
  // `hashchange`. Re-assert the hash after the navigation commits.
  if (samePathname) {
    window.setTimeout(() => {
      assertHashForHighlight(entry.sectionId);
    }, 0);
  }
}
