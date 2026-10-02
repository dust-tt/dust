import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const S = ADMIN_SECTION_IDS.secrets;
const PAGE = "dev_secrets" as const;

export const DEVELOPER_SECRETS_PAGE_TITLE = "Developer Secrets";
export const CREATE_SECRET_LABEL = "Create Secret";

/** Search entries for Developer Secrets. */
export const SECRETS_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(PAGE, S.secrets, [
    [DEVELOPER_SECRETS_PAGE_TITLE, "env.secrets dust apps mcp servers"],
    [CREATE_SECRET_LABEL, "secret name value"],
  ]),
];
