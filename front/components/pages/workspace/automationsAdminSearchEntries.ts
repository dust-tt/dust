import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const A = ADMIN_SECTION_IDS.automations;
const PAGE = "automations" as const;

/**
 * Search entries for Automations. Slack workflows use `?tab=slack-workflows`.
 */
export const AUTOMATIONS_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(
    PAGE,
    A.triggers,
    [
      ["Triggers", "schedule webhook owner agent credits pool enabled"],
      ["Set pool", "workspace pool member pool"],
      ["Filters", "type pool enabled"],
    ],
    "triggers"
  ),
  ...adminSearchEntries(
    PAGE,
    A.slackWorkflows,
    [
      ["Slack workflows", "allow workflow spaces list revoke"],
      ["Allow a workflow", "slack workflow spaces"],
    ],
    "slack-workflows"
  ),
];
