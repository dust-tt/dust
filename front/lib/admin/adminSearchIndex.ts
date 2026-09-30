import { AUTOMATIONS_SEARCH_ENTRIES } from "@app/components/pages/workspace/automationsAdminSearchEntries";
import { BILLING_SEARCH_ENTRIES } from "@app/components/pages/workspace/billing/billingAdminSearchEntries";
import { API_KEYS_SEARCH_ENTRIES } from "@app/components/pages/workspace/developers/apiKeysAdminSearchEntries";
import { COMPUTER_SEARCH_ENTRIES } from "@app/components/pages/workspace/developers/computerAdminSearchEntries";
import { SECRETS_SEARCH_ENTRIES } from "@app/components/pages/workspace/developers/secretsAdminSearchEntries";
import { SELF_IMPROVING_SKILLS_SEARCH_ENTRIES } from "@app/components/pages/workspace/developers/selfImprovingSkillsAdminSearchEntries";
import { GOVERNANCE_SEARCH_ENTRIES } from "@app/components/pages/workspace/governance/governanceAdminSearchEntries";
import { IDENTITY_SEARCH_ENTRIES } from "@app/components/pages/workspace/identityAdminSearchEntries";
import { USAGE_SEARCH_ENTRIES } from "@app/components/pages/workspace/usageAdminSearchEntries";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { searchAdminSettings } from "@app/lib/admin/searchAdminSettings";

/**
 * Composed admin settings search index. Import colocated page catalogs here
 * as more pages gain section anchors.
 */
export const ADMIN_SEARCH_INDEX: AdminSettingEntry[] = [
  ...GOVERNANCE_SEARCH_ENTRIES,
  ...IDENTITY_SEARCH_ENTRIES,
  ...USAGE_SEARCH_ENTRIES,
  ...BILLING_SEARCH_ENTRIES,
  ...API_KEYS_SEARCH_ENTRIES,
  ...AUTOMATIONS_SEARCH_ENTRIES,
  ...SECRETS_SEARCH_ENTRIES,
  ...COMPUTER_SEARCH_ENTRIES,
  ...SELF_IMPROVING_SKILLS_SEARCH_ENTRIES,
];

export function searchAdminSettingsIndex(
  query: string,
  pageLabel: (pageId: string) => string
): AdminSettingEntry[] {
  return searchAdminSettings(ADMIN_SEARCH_INDEX, query, pageLabel);
}
