import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const C = ADMIN_SECTION_IDS.creditsUsage;
const PAGE = "credits_usage" as const;

/** Search entries for Credits Usage (legacy programmatic credits). */
export const CREDITS_USAGE_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(PAGE, C.credits, [
    ["Programmatic Usage", "credits usage api"],
    ["Available credits", "free purchased pay as you go"],
    ["Buy credits", "purchase top up"],
    ["Current credits", "active credits list"],
    ["Past credits", "credit history expired"],
  ]),
];
