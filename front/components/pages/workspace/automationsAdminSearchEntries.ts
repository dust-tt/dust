import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const A = ADMIN_SECTION_IDS.automations;
const PAGE = "automations" as const;

export const AUTOMATIONS_TRIGGERS_TAB_LABEL = "Triggers";
export const AUTOMATIONS_SLACK_WORKFLOWS_TAB_LABEL = "Slack workflows";

/**
 * Search entries for Automations. Slack workflows use `?tab=slack-workflows`.
 */
export const AUTOMATIONS_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(PAGE, A.triggers, [
    [
      AUTOMATIONS_TRIGGERS_TAB_LABEL,
      "schedule webhook owner agent credits pool enabled",
    ],
    ["Set pool", "workspace pool member pool"],
    ["Filters", "type pool enabled"],
  ]),
  ...adminSearchEntries(
    PAGE,
    A.slackWorkflows,
    [
      [
        AUTOMATIONS_SLACK_WORKFLOWS_TAB_LABEL,
        "allow workflow spaces list revoke",
      ],
      ["Allow a workflow", "slack workflow spaces"],
    ],
    "slack-workflows"
  ),
];
