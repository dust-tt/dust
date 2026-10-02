import {
  CONFIG_ENV_VARS_LABEL,
  ENVIRONMENT_VARIABLES_LABEL,
  HTTPS_SECRETS_LABEL,
  WRITE_ONLY_ENV_VALUES_LABEL,
} from "@app/components/sandbox/SandboxEnvVarsSection";
import { CREATE_API_KEY_LABEL } from "@app/components/workspace/api-keys/NewAPIKeyDialog";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const K = ADMIN_SECTION_IDS.apiKeys;
const S = ADMIN_SECTION_IDS.secrets;
const C = ADMIN_SECTION_IDS.computer;
const PAGE = "developers" as const;

export const API_KEYS_PAGE_TITLE = "Dust API Keys";
export const DEVELOPER_SECRETS_PAGE_TITLE = "Developer Secrets";
export const CREATE_SECRET_LABEL = "Create Secret";

/** Search entries for Developers (API keys, secrets, computer environment). */
export const DEVELOPERS_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(
    PAGE,
    K.keys,
    [
      [API_KEYS_PAGE_TITLE, "keys active credits used programmatic"],
      [CREATE_API_KEY_LABEL, "new key scope spaces monthly cap"],
      ["API key list", "name scope key spaces credits last used status"],
      ["Revoke API key", "revoke"],
      ["Edit monthly cap", "per key credits cap"],
    ],
    "keys"
  ),
  ...adminSearchEntries(
    PAGE,
    S.secrets,
    [
      [DEVELOPER_SECRETS_PAGE_TITLE, "env.secrets dust apps mcp servers"],
      [CREATE_SECRET_LABEL, "secret name value"],
    ],
    "secrets"
  ),
  ...adminSearchEntries(
    PAGE,
    C.environment,
    [
      [
        ENVIRONMENT_VARIABLES_LABEL,
        "computer env vars secrets config workspace",
      ],
      [
        HTTPS_SECRETS_LABEL,
        "computer encrypted outbound https allowlisted domains env",
      ],
      [CONFIG_ENV_VARS_LABEL, "computer plain environment variables"],
      [WRITE_ONLY_ENV_VALUES_LABEL, "snapshotted at computer start"],
    ],
    "env"
  ),
];
