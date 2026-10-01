import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const A = ADMIN_SECTION_IDS.analytics;
const PAGE = "analytics" as const;

/** Search entries for Analytics (consumption). */
export const ANALYTICS_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(PAGE, A.consumption, [
    ["Analytics", "consumption usage breakdown"],
    ["Consumption overview", "credits used period"],
    ["Consumption chart", "trend graph"],
    ["Attribution table", "agents members groups skills"],
    ["Usage filters", "filter dimension scope"],
    ["Export analytics", "download csv export"],
  ]),
];
