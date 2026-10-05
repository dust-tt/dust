import type { SubNavigationAdminId } from "@app/components/navigation/config";
import type { AdminSectionId } from "@app/lib/admin/adminSectionIds";

/** One searchable setting: where it lives and how people might ask for it. */
export type AdminSettingEntry = {
  label: string;
  pageId: SubNavigationAdminId;
  /** In-page tab (`?tab=`), when the target page is tabbed. */
  tab?: string;
  sectionId: AdminSectionId;
  keywords?: string;
};

type SearchItem = string | [label: string, keywords: string];

/**
 * Build search entries for one section. Mirrors the playground `e()` helper.
 */
export function adminSearchEntries(
  pageId: SubNavigationAdminId,
  sectionId: AdminSectionId,
  items: SearchItem[],
  tab?: string
): AdminSettingEntry[] {
  return items.map((item) =>
    typeof item === "string"
      ? { pageId, sectionId, tab, label: item }
      : { pageId, sectionId, tab, label: item[0], keywords: item[1] }
  );
}
