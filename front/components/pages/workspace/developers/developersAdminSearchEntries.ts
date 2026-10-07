import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { SANDBOX_ENV_VAR_PREFIX } from "@app/lib/api/sandbox/env_vars";

const K = ADMIN_SECTION_IDS.apiKeys;
const S = ADMIN_SECTION_IDS.secrets;
const C = ADMIN_SECTION_IDS.computer;
const PAGE = "developers" as const;

/** Search entries for Developers (API keys, secrets, computer environment). */
export const DEVELOPERS_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(
    PAGE,
    K.keys,
    [
      ["Dust API Keys", "keys active credits used programmatic"],
      ["Create API Key", "new key scope spaces monthly cap"],
      ["API key list", "name scope key spaces credits last used status"],
      ["Revoke API key", "revoke"],
      ["Edit monthly cap", "per key credits cap"],
      ["API Reference", "docs documentation api reference"],
    ],
    "keys"
  ),
  ...adminSearchEntries(
    PAGE,
    S.secrets,
    [
      ["Developer Secrets", "env.secrets dust apps mcp servers"],
      ["Create Secret", "secret name value"],
      ["API Reference", "docs documentation secrets api reference"],
    ],
    "secrets"
  ),
  ...adminSearchEntries(
    PAGE,
    C.environment,
    [
      ["Environment variables", "computer env vars secrets config workspace"],
      [
        "HTTPS secrets (DSEC_)",
        "computer encrypted outbound https allowlisted domains env",
      ],
      [
        `Config (${SANDBOX_ENV_VAR_PREFIX})`,
        "computer plain environment variables",
      ],
      ["Write-only values", "snapshotted at computer start"],
    ],
    "env"
  ),
];
