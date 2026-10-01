import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const A = ADMIN_SECTION_IDS.appCredentials;
const PAGE = "providers" as const;

/** Search entries for App Credentials (legacy Dust Apps providers). */
export const APP_CREDENTIALS_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(PAGE, A.modelProviders, [
    ["App Credentials", "dust apps providers api keys"],
    ["Model Providers", "openai anthropic azure configure api key"],
  ]),
  ...adminSearchEntries(PAGE, A.serviceProviders, [
    ["Service Providers", "external data write services configure api key"],
  ]),
];
