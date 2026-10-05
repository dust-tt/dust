import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const B = ADMIN_SECTION_IDS.branding;
const PAGE = "workspace_branding" as const;

/** Search entries for Branding. */
export const BRANDING_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(PAGE, B.branding, [
    ["Workspace branding", "whitelabel frames brand"],
    ["Logo", "shared frame header logo upload"],
    ["Icon", "favicon square upload"],
  ]),
];
