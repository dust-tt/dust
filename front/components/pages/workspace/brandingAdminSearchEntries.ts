import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { msg } from "@lingui/core/macro";

const B = ADMIN_SECTION_IDS.branding;
const PAGE = "workspace_branding" as const;

/** Search entries for Branding. */
export const BRANDING_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(PAGE, B.branding, [
    [msg`Workspace branding`, msg`whitelabel frames brand`],
    [msg`Logo`, msg`shared frame header logo upload`],
    [msg`Icon`, msg`favicon square upload`],
  ]),
];
