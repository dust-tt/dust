import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const C = ADMIN_SECTION_IDS.creditsUsage;
const PAGE = "credits" as const;

/**
 * Legacy Programmatic Usage page (non–credit-priced plans). Indexed under
 * Credits so deep links land on the Credits settings area that superseded it.
 */
export const CREDITS_USAGE_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(
    PAGE,
    C.credits,
    [
      ["Programmatic Usage", "credits usage api"],
      ["Purchase additional credits", "buy top-up programmatic"],
    ],
    "settings"
  ),
];
