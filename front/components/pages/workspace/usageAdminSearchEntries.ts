import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { msg } from "@lingui/core/macro";

const U = ADMIN_SECTION_IDS.usage;
const PAGE = "credits" as const;
const SETTINGS_TAB = "settings";

/**
 * Search entries for Credits (formerly Usage). Per-member and per-group model
 * tiers are edited on the Members / Groups tabs here (credit-priced plans only;
 * the Credits route itself is plan-gated). Workspace defaults and the Published
 * agents override live under Models › Settings. Self-improving spend caps sit
 * in programmatic settings.
 */
export const USAGE_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(
    PAGE,
    U.members,
    [
      [msg`Members usage`, msg`seats spend limit upgrade requests`],
      [
        msg`Members model tiers`,
        msg`model tiers member access tier per user standard advanced frontier`,
      ],
      [msg`Upgrade requests`, msg`review member requests deny`],
      [msg`Change seat type`, msg`upgrade seat assign seat remove seat`],
      [msg`Edit spend limit`, msg`override member limit`],
    ],
    "members"
  ),
  ...adminSearchEntries(
    PAGE,
    U.groups,
    [
      [msg`Groups usage`, msg`group spend limit seat`],
      [
        msg`Group model tiers`,
        msg`model tiers group access tier per group standard advanced frontier`,
      ],
      [msg`Group monthly spend limit`, msg`per group limit`],
    ],
    "groups"
  ),
  ...adminSearchEntries(
    PAGE,
    U.topUps,
    [
      [
        msg`Top-ups history`,
        msg`credit grants added credits expiration bonus purchased`,
      ],
    ],
    "top-ups"
  ),
  // Always mounted above the Credits tabs (no `?tab=`).
  ...adminSearchEntries(PAGE, U.addCredits, [
    [msg`Add credits`, msg`buy top-up purchase additional credits`],
    [msg`Purchase additional credits`, msg`buy top-up programmatic`],
  ]),
  ...adminSearchEntries(
    PAGE,
    U.spendingPolicies,
    [
      [
        msg`Default per-user workspace credit pool monthly limit`,
        msg`spending policy default limit pool`,
      ],
      [msg`Upgrade request`, msg`allow members request upgrade`],
      [msg`Require a reason for upgrade requests`, msg`justification`],
      [msg`Auto-upgrade seats`, msg`free pro max at limit`],
      [msg`Credit spend checkpoint`, msg`pause agent message threshold`],
    ],
    SETTINGS_TAB
  ),
  ...adminSearchEntries(
    PAGE,
    U.programmatic,
    [
      // Legacy Programmatic Usage page keywords, retargeted here.
      [msg`Programmatic Usage`, msg`credits usage api keys triggers`],
      [
        msg`Programmatic monthly limit`,
        msg`api keys triggers block programmatic access`,
      ],
      [
        msg`Global spending cap`,
        msg`self improving skills monthly cap credits`,
      ],
      [msg`Default cost cap per skill`, msg`self improving skills per run cap`],
    ],
    SETTINGS_TAB
  ),
  ...adminSearchEntries(
    PAGE,
    U.notifications,
    [
      [
        msg`Workspace credit pool threshold alert`,
        msg`email alert pool percent`,
      ],
      [msg`Upgrade request emails`, msg`email admins managers`],
    ],
    SETTINGS_TAB
  ),
];
