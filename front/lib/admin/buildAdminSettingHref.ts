import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";

/** Build a deep link to an admin setting (optional `?tab=` + `#sectionId`). */
export function buildAdminSettingHref(
  pageHref: string,
  entry: Pick<AdminSettingEntry, "tab" | "sectionId">
): string {
  const [path, existingQuery = ""] = pageHref.split("?");
  const params = new URLSearchParams(existingQuery);
  if (entry.tab) {
    params.set("tab", entry.tab);
  }
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}#${entry.sectionId}`;
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
  const samePage =
    target.pathname === window.location.pathname &&
    target.search === window.location.search;

  if (samePage) {
    const nextHash = `#${entry.sectionId}`;
    if (window.location.hash === nextHash) {
      window.location.hash = "";
    }
    window.location.hash = entry.sectionId;
    return;
  }

  push(href);
}
