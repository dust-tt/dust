import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { SANDBOX_ENV_VAR_PREFIX } from "@app/lib/api/sandbox/env_vars";
import { msg } from "@lingui/core/macro";

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
      [msg`Dust API Keys`, msg`keys active credits used programmatic`],
      [msg`Create API Key`, msg`new key scope spaces monthly cap`],
      [msg`API key list`, msg`name scope key spaces credits last used status`],
      [msg`Revoke API key`, msg`revoke`],
      [msg`Edit monthly cap`, msg`per key credits cap`],
      [msg`API Reference`, msg`docs documentation api reference`],
    ],
    "keys"
  ),
  ...adminSearchEntries(
    PAGE,
    S.secrets,
    [
      [msg`Developer Secrets`, msg`env.secrets dust apps mcp servers`],
      [msg`Create Secret`, msg`secret name value`],
      [msg`API Reference`, msg`docs documentation secrets api reference`],
    ],
    "secrets"
  ),
  ...adminSearchEntries(
    PAGE,
    C.environment,
    [
      [
        msg`Environment variables`,
        msg`computer env vars secrets config workspace`,
      ],
      [
        msg`HTTPS secrets (DSEC_)`,
        msg`computer encrypted outbound https allowlisted domains env`,
      ],
      [
        msg`Config (${SANDBOX_ENV_VAR_PREFIX})`,
        msg`computer plain environment variables`,
      ],
      [msg`Write-only values`, msg`snapshotted at computer start`],
    ],
    "env"
  ),
];
