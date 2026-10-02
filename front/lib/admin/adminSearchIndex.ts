import { ANALYTICS_SEARCH_ENTRIES } from "@app/components/pages/workspace/analyticsAdminSearchEntries";
import { AUTOMATIONS_SEARCH_ENTRIES } from "@app/components/pages/workspace/automationsAdminSearchEntries";
import { BILLING_SEARCH_ENTRIES } from "@app/components/pages/workspace/billing/billingAdminSearchEntries";
import { BRANDING_SEARCH_ENTRIES } from "@app/components/pages/workspace/brandingAdminSearchEntries";
import { API_KEYS_SEARCH_ENTRIES } from "@app/components/pages/workspace/developers/apiKeysAdminSearchEntries";
import { APP_CREDENTIALS_SEARCH_ENTRIES } from "@app/components/pages/workspace/developers/appCredentialsAdminSearchEntries";
import { COMPUTER_SEARCH_ENTRIES } from "@app/components/pages/workspace/developers/computerAdminSearchEntries";
import { CREDITS_USAGE_SEARCH_ENTRIES } from "@app/components/pages/workspace/developers/creditsUsageAdminSearchEntries";
import { SECRETS_SEARCH_ENTRIES } from "@app/components/pages/workspace/developers/secretsAdminSearchEntries";
import { SELF_IMPROVING_SKILLS_SEARCH_ENTRIES } from "@app/components/pages/workspace/developers/selfImprovingSkillsAdminSearchEntries";
import { GOVERNANCE_SEARCH_ENTRIES } from "@app/components/pages/workspace/governance/governanceAdminSearchEntries";
import { IDENTITY_SEARCH_ENTRIES } from "@app/components/pages/workspace/identityAdminSearchEntries";
import { MODEL_PROVIDERS_SEARCH_ENTRIES } from "@app/components/pages/workspace/modelProvidersAdminSearchEntries";
import { PEOPLE_SEARCH_ENTRIES } from "@app/components/pages/workspace/peopleAdminSearchEntries";
import { SUBSCRIPTION_SEARCH_ENTRIES } from "@app/components/pages/workspace/subscriptionAdminSearchEntries";
import { USAGE_SEARCH_ENTRIES } from "@app/components/pages/workspace/usageAdminSearchEntries";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { searchAdminSettings } from "@app/lib/admin/searchAdminSettings";

/**
 * Composed admin settings search index. Import colocated page catalogs here
 * as more pages gain section anchors.
 */
export const ADMIN_SEARCH_INDEX: AdminSettingEntry[] = [
  ...PEOPLE_SEARCH_ENTRIES,
  ...GOVERNANCE_SEARCH_ENTRIES,
  ...IDENTITY_SEARCH_ENTRIES,
  ...BRANDING_SEARCH_ENTRIES,
  ...USAGE_SEARCH_ENTRIES,
  ...MODEL_PROVIDERS_SEARCH_ENTRIES,
  ...ANALYTICS_SEARCH_ENTRIES,
  ...BILLING_SEARCH_ENTRIES,
  ...SUBSCRIPTION_SEARCH_ENTRIES,
  ...API_KEYS_SEARCH_ENTRIES,
  ...CREDITS_USAGE_SEARCH_ENTRIES,
  ...AUTOMATIONS_SEARCH_ENTRIES,
  ...APP_CREDENTIALS_SEARCH_ENTRIES,
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
