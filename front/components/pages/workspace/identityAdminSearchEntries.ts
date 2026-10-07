import {
  COMPUTER_ALLOWED_DOMAINS_LABEL,
  COMPUTER_NETWORK_SECTION_LABEL,
} from "@app/components/pages/workspace/developers/computerAdminSearchEntries";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { msg } from "@lingui/core/macro";

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
      [msg`Domain Verification`, msg`verified domains domain status`],
      [msg`Add Domain`, msg`verify company domain`],
    ],
    "identity"
  ),
  ...adminSearchEntries(
    PAGE,
    I.sso,
    [
      [
        msg`Single Sign-On (SSO)`,
        msg`workos google oidc saml idp configure de-activate`,
      ],
      [msg`Enforce SSO login`, msg`disable social logins`],
    ],
    "identity"
  ),
  ...adminSearchEntries(
    PAGE,
    C.agentDomains,
    [
      [
        msg`Agent-requested domains`,
        msg`computer sandbox approval per domain egress`,
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
        msg`network allowlist workspace pod egress computer`,
      ],
      [
        COMPUTER_ALLOWED_DOMAINS_LABEL,
        msg`network allowlist wildcard exact domain workspace pod egress computer`,
      ],
    ],
    "network"
  ),
  ...adminSearchEntries(
    PAGE,
    I.auditLogs,
    [
      [msg`View Logs`, msg`workspace activity logs audit`],
      [msg`Configure Export`, msg`siem export audit`],
    ],
    "audit"
  ),
  ...adminSearchEntries(
    PAGE,
    G.audit,
    [[msg`Audit logs`, msg`emit audit events workos`]],
    "audit"
  ),
];
