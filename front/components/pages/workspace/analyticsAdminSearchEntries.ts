import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { msg } from "@lingui/core/macro";

const A = ADMIN_SECTION_IDS.analytics;
const PAGE = "analytics" as const;

/** Search entries for Analytics (consumption + export). */
export const ANALYTICS_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(
    PAGE,
    A.consumption,
    [
      [msg`Analytics`, msg`consumption usage breakdown`],
      [msg`Consumption overview`, msg`credits used period`],
      [msg`Consumption chart`, msg`trend graph`],
      [msg`Attribution table`, msg`agents members groups skills`],
      [msg`Usage filters`, msg`filter dimension scope`],
      [
        msg`Self-improving skills consumption`,
        msg`self improving skills consumption current period spend`,
      ],
    ],
    "consumption"
  ),
  ...adminSearchEntries(
    PAGE,
    A.export,
    [
      [msg`Export analytics`, msg`download csv export usage data raw`],
      [msg`Export usage data`, msg`csv download raw data`],
    ],
    "export"
  ),
];
