import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { msg } from "@lingui/core/macro";

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
      [msg`Triggers`, msg`schedule webhook owner agent credits pool enabled`],
      [msg`Set pool`, msg`workspace pool member pool`],
      [msg`Filters`, msg`type pool enabled`],
    ],
    "triggers"
  ),
  ...adminSearchEntries(
    PAGE,
    A.slackWorkflows,
    [
      [msg`Slack workflows`, msg`allow workflow spaces list revoke`],
      [msg`Allow a workflow`, msg`slack workflow spaces`],
    ],
    "slack-workflows"
  ),
];
