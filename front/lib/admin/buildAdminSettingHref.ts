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
