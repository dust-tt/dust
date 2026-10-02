import { CREATE_API_KEY_LABEL } from "@app/components/workspace/api-keys/NewAPIKeyDialog";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const K = ADMIN_SECTION_IDS.apiKeys;
const PAGE = "api_keys" as const;

export const API_KEYS_PAGE_TITLE = "Dust API Keys";

/** Search entries for Dust API Keys. */
export const API_KEYS_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(PAGE, K.keys, [
    [API_KEYS_PAGE_TITLE, "keys active credits used programmatic"],
    [CREATE_API_KEY_LABEL, "new key scope spaces monthly cap"],
    ["API key list", "name scope key spaces credits last used status"],
    ["Revoke API key", "revoke"],
    ["Edit monthly cap", "per key credits cap"],
  ]),
];
