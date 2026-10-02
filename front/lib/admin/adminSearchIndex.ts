import { ANALYTICS_SEARCH_ENTRIES } from "@app/components/pages/workspace/analyticsAdminSearchEntries";
import { AUTOMATIONS_SEARCH_ENTRIES } from "@app/components/pages/workspace/automationsAdminSearchEntries";
import { BILLING_SEARCH_ENTRIES } from "@app/components/pages/workspace/billing/billingAdminSearchEntries";
import { BRANDING_SEARCH_ENTRIES } from "@app/components/pages/workspace/brandingAdminSearchEntries";
import { CREDITS_USAGE_SEARCH_ENTRIES } from "@app/components/pages/workspace/developers/creditsUsageAdminSearchEntries";
import { DEVELOPERS_SEARCH_ENTRIES } from "@app/components/pages/workspace/developers/developersAdminSearchEntries";
import { GOVERNANCE_SEARCH_ENTRIES } from "@app/components/pages/workspace/governance/governanceAdminSearchEntries";
import { IDENTITY_SEARCH_ENTRIES } from "@app/components/pages/workspace/identityAdminSearchEntries";
import { INTEGRATIONS_SEARCH_ENTRIES } from "@app/components/pages/workspace/integrationsAdminSearchEntries";
import { MODEL_PROVIDERS_SEARCH_ENTRIES } from "@app/components/pages/workspace/modelProvidersAdminSearchEntries";
import { PEOPLE_SEARCH_ENTRIES } from "@app/components/pages/workspace/peopleAdminSearchEntries";
import { SUBSCRIPTION_SEARCH_ENTRIES } from "@app/components/pages/workspace/subscriptionAdminSearchEntries";
import { USAGE_SEARCH_ENTRIES } from "@app/components/pages/workspace/usageAdminSearchEntries";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { searchAdminSettings } from "@app/lib/admin/searchAdminSettings";

/**
 * Composed admin settings search index for the Organization / Spend / Platform
 * information architecture.
 */
export const ADMIN_SEARCH_INDEX: AdminSettingEntry[] = [
  ...PEOPLE_SEARCH_ENTRIES,
  ...IDENTITY_SEARCH_ENTRIES,
  ...GOVERNANCE_SEARCH_ENTRIES,
  ...BRANDING_SEARCH_ENTRIES,
  ...USAGE_SEARCH_ENTRIES,
  ...CREDITS_USAGE_SEARCH_ENTRIES,
  ...BILLING_SEARCH_ENTRIES,
  ...SUBSCRIPTION_SEARCH_ENTRIES,
  ...ANALYTICS_SEARCH_ENTRIES,
  ...MODEL_PROVIDERS_SEARCH_ENTRIES,
  ...INTEGRATIONS_SEARCH_ENTRIES,
  ...AUTOMATIONS_SEARCH_ENTRIES,
  ...DEVELOPERS_SEARCH_ENTRIES,
];

export function searchAdminSettingsIndex(
  query: string,
  pageLabel: (pageId: string) => string
): AdminSettingEntry[] {
  return searchAdminSettings(ADMIN_SEARCH_INDEX, query, pageLabel);
}
