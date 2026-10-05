import {
  COMPUTER_ALLOWED_DOMAINS_LABEL,
  COMPUTER_NETWORK_SECTION_LABEL,
} from "@app/components/pages/workspace/developers/computerAdminSearchEntries";
import { AGENT_REQUESTED_DOMAINS_LABEL } from "@app/components/sandbox/AgentRequestedDomainsSetting";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const I = ADMIN_SECTION_IDS.identity;
const C = ADMIN_SECTION_IDS.computer;
const G = ADMIN_SECTION_IDS.governance;
const PAGE = "security" as const;

/**
 * Search entries for Security. Domains & SSO, Network (from Computer), and
 * Audit Logs. Provisioning and Auto-join live under Members.
 */
export const IDENTITY_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(
    PAGE,
    I.domain,
    [
      ["Domain Verification", "verified domains domain status"],
      ["Add Domain", "verify company domain"],
    ],
    "identity"
  ),
  ...adminSearchEntries(
    PAGE,
    I.sso,
    [
      [
        "Single Sign-On (SSO)",
        "workos google oidc saml idp configure de-activate",
      ],
      ["Enforce SSO login", "disable social logins"],
    ],
    "identity"
  ),
  ...adminSearchEntries(
    PAGE,
    C.agentDomains,
    [
      [
        AGENT_REQUESTED_DOMAINS_LABEL,
        "computer sandbox approval per domain egress",
      ],
    ],
    "network"
  ),
  ...adminSearchEntries(
    PAGE,
    C.network,
    [
      [
        COMPUTER_NETWORK_SECTION_LABEL,
        "network allowlist workspace pod egress computer",
      ],
      [
        COMPUTER_ALLOWED_DOMAINS_LABEL,
        "network allowlist wildcard exact domain workspace pod egress computer",
      ],
    ],
    "network"
  ),
  ...adminSearchEntries(
    PAGE,
    I.auditLogs,
    [
      ["View Logs", "workspace activity logs audit"],
      ["Configure Export", "siem export audit"],
    ],
    "audit"
  ),
  ...adminSearchEntries(
    PAGE,
    G.audit,
    [["Audit logs", "emit audit events workos"]],
    "audit"
  ),
];
