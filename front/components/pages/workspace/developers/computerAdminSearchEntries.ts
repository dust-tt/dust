import { AGENT_REQUESTED_DOMAINS_LABEL } from "@app/components/sandbox/AgentRequestedDomainsSetting";
import {
  CONFIG_ENV_VARS_LABEL,
  ENVIRONMENT_VARIABLES_LABEL,
  HTTPS_SECRETS_LABEL,
  WRITE_ONLY_ENV_VALUES_LABEL,
} from "@app/components/sandbox/SandboxEnvVarsSection";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const C = ADMIN_SECTION_IDS.computer;
const PAGE = "sandbox" as const;

export const COMPUTER_NETWORK_SECTION_LABEL = "Network";
export const COMPUTER_ALLOWED_DOMAINS_LABEL = "Allowed domains";

/** Search entries for Computer (sandbox) administration. */
export const COMPUTER_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(PAGE, C.agentDomains, [
    [
      AGENT_REQUESTED_DOMAINS_LABEL,
      "computer sandbox approval per domain egress",
    ],
  ]),
  ...adminSearchEntries(PAGE, C.network, [
    [
      COMPUTER_NETWORK_SECTION_LABEL,
      "network allowlist workspace pod egress computer",
    ],
    [
      COMPUTER_ALLOWED_DOMAINS_LABEL,
      "network allowlist wildcard exact domain workspace pod egress computer",
    ],
  ]),
  ...adminSearchEntries(PAGE, C.environment, [
    [ENVIRONMENT_VARIABLES_LABEL, "computer env vars secrets config workspace"],
    [
      HTTPS_SECRETS_LABEL,
      "computer encrypted outbound https allowlisted domains env",
    ],
    [CONFIG_ENV_VARS_LABEL, "computer plain environment variables"],
    [WRITE_ONLY_ENV_VALUES_LABEL, "snapshotted at computer start"],
  ]),
];
