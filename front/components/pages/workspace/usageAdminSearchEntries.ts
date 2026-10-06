import {
  DEFAULT_COST_CAP_PER_SKILL_LABEL,
  GLOBAL_SPENDING_CAP_LABEL,
} from "@app/components/workspace/settings/SelfImprovingSkillsSettingsSection";
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
  ...adminSearchEntries(
    PAGE,
    U.members,
    [
      ["Members usage", "seats spend limit upgrade requests"],
      [
        "Members model tiers",
        "model tiers member access tier per user standard advanced frontier",
      ],
      ["Upgrade requests", "review member requests deny"],
      ["Change seat type", "upgrade seat assign seat remove seat"],
      ["Edit spend limit", "override member limit"],
    ],
    "members"
  ),
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
  // Always mounted above the Credits tabs (no `?tab=`).
  ...adminSearchEntries(PAGE, U.addCredits, [
    ["Add credits", "buy top-up purchase additional credits"],
    ["Purchase additional credits", "buy top-up programmatic"],
  ]),
  ...adminSearchEntries(
    PAGE,
    U.spendingPolicies,
    [
      [
        "Default per-user workspace credit pool monthly limit",
        "spending policy default limit pool",
      ],
      ["Upgrade request", "allow members request upgrade"],
      ["Require a reason for upgrade requests", "justification"],
      ["Auto-upgrade seats", "free pro max at limit"],
    ],
    SETTINGS_TAB
  ),
  ...adminSearchEntries(
    PAGE,
    U.costManagement,
    [["Credit spend checkpoint", "pause agent message threshold"]],
    SETTINGS_TAB
  ),
  ...adminSearchEntries(
    PAGE,
    U.programmatic,
    [
      // Legacy Programmatic Usage page keywords, retargeted here.
      ["Programmatic Usage", "credits usage api keys triggers"],
      [
        "Programmatic monthly limit",
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
      ["Workspace credit pool threshold alert", "email alert pool percent"],
      ["Upgrade request emails", "email admins managers"],
    ],
    SETTINGS_TAB
  ),
];
