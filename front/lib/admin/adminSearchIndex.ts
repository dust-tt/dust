import { GOVERNANCE_SEARCH_ENTRIES } from "@app/components/pages/workspace/governance/governanceAdminSearchEntries";
import { IDENTITY_SEARCH_ENTRIES } from "@app/components/pages/workspace/identityAdminSearchEntries";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { searchAdminSettings } from "@app/lib/admin/searchAdminSettings";

/**
 * Composed admin settings search index. Import colocated page catalogs here
 * as more pages gain section anchors.
 */
export const ADMIN_SEARCH_INDEX: AdminSettingEntry[] = [
  ...GOVERNANCE_SEARCH_ENTRIES,
  ...IDENTITY_SEARCH_ENTRIES,
];

export function searchAdminSettingsIndex(
  query: string,
  pageLabel: (pageId: string) => string
): AdminSettingEntry[] {
  return searchAdminSettings(ADMIN_SEARCH_INDEX, query, pageLabel);
}
