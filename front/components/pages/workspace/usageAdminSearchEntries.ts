import {
  DEFAULT_COST_CAP_PER_SKILL_LABEL,
  GLOBAL_SPENDING_CAP_LABEL,
} from "@app/components/workspace/settings/SelfImprovingSkillsSettingsSection";
import { CREDIT_SPEND_CHECKPOINT_LABEL } from "@app/components/workspace/usage/CreditSpendCheckpointSettingsCard";
import {
  UPGRADE_REQUEST_EMAILS_LABEL,
  WORKSPACE_CREDIT_POOL_THRESHOLD_ALERT_LABEL,
} from "@app/components/workspace/usage/UsageNotificationsCard";
import { PROGRAMMATIC_MONTHLY_LIMIT_LABEL } from "@app/components/workspace/usage/UsageProgrammaticLimitCard";
import {
  AUTO_UPGRADE_SEATS_LABEL,
  DEFAULT_PER_USER_POOL_LIMIT_LABEL,
  REQUIRE_UPGRADE_REQUEST_REASON_LABEL,
  UPGRADE_REQUEST_LABEL,
} from "@app/components/workspace/usage/UsageSettingsCard";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const U = ADMIN_SECTION_IDS.usage;
const PAGE = "credits" as const;
const SETTINGS_TAB = "settings";

/**
 * Search entries for Credits (formerly Usage). Per-member and per-group model
 * tiers are edited on the Members / Groups tabs; workspace defaults live under
 * Models › Access tiers. Self-improving spend caps sit in programmatic settings.
 */
export const USAGE_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(PAGE, U.members, [
    ["Members usage", "seats spend limit upgrade requests"],
    [
      "Members model tiers",
      "model tiers member access tier per user standard advanced frontier",
    ],
    ["Upgrade requests", "review member requests deny"],
    ["Change seat type", "upgrade seat assign seat remove seat"],
    ["Edit spend limit", "override member limit"],
  ]),
  ...adminSearchEntries(
    PAGE,
    U.groups,
    [
      ["Groups usage", "group spend limit seat"],
      [
        "Group model tiers",
        "model tiers group access tier per group standard advanced frontier",
      ],
      ["Group monthly spend limit", "per group limit"],
    ],
    "groups"
  ),
  ...adminSearchEntries(
    PAGE,
    U.topUps,
    [
      [
        "Top-ups history",
        "credit grants added credits expiration bonus purchased",
      ],
    ],
    "top-ups"
  ),
  ...adminSearchEntries(
    PAGE,
    U.spendingPolicies,
    [
      [DEFAULT_PER_USER_POOL_LIMIT_LABEL, "spending policy default limit pool"],
      [UPGRADE_REQUEST_LABEL, "allow members request upgrade"],
      [REQUIRE_UPGRADE_REQUEST_REASON_LABEL, "justification"],
      [AUTO_UPGRADE_SEATS_LABEL, "free pro max at limit"],
    ],
    SETTINGS_TAB
  ),
  ...adminSearchEntries(
    PAGE,
    U.costManagement,
    [[CREDIT_SPEND_CHECKPOINT_LABEL, "pause agent message threshold"]],
    SETTINGS_TAB
  ),
  ...adminSearchEntries(
    PAGE,
    U.programmatic,
    [
      [
        PROGRAMMATIC_MONTHLY_LIMIT_LABEL,
        "api keys triggers block programmatic access",
      ],
      [GLOBAL_SPENDING_CAP_LABEL, "self improving skills monthly cap credits"],
      [DEFAULT_COST_CAP_PER_SKILL_LABEL, "self improving skills per run cap"],
    ],
    SETTINGS_TAB
  ),
  ...adminSearchEntries(
    PAGE,
    U.notifications,
    [
      [WORKSPACE_CREDIT_POOL_THRESHOLD_ALERT_LABEL, "email alert pool percent"],
      [UPGRADE_REQUEST_EMAILS_LABEL, "email admins managers"],
    ],
    SETTINGS_TAB
  ),
];
