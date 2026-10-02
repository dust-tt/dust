import {
  AUDIT_LOGS_CONFIGURE_EXPORT_LABEL,
  AUDIT_LOGS_VIEW_LABEL,
} from "@app/components/workspace/AuditLogsSection";
import { DIRECTORY_SYNC_LABEL } from "@app/components/workspace/DirectorySync";
import {
  ENFORCE_SSO_LABEL,
  SSO_HEADING_LABEL,
} from "@app/components/workspace/sso/WorkOSSSOConnection";
import {
  ADD_DOMAIN_LABEL,
  DOMAIN_VERIFICATION_TITLE,
} from "@app/components/workspace/WorkspaceAccessPanel";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const I = ADMIN_SECTION_IDS.identity;
const PAGE = "identity_and_provisioning" as const;

/**
 * Search entries for IT & Security. Labels come from the same UI constants the
 * page renders; keep this next to the identity page when moving settings.
 */
export const IDENTITY_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(PAGE, I.domain, [
    [DOMAIN_VERIFICATION_TITLE, "verified domains domain status"],
    [ADD_DOMAIN_LABEL, "verify company domain"],
  ]),
  ...adminSearchEntries(PAGE, I.sso, [
    [SSO_HEADING_LABEL, "workos google oidc saml idp configure de-activate"],
    [ENFORCE_SSO_LABEL, "disable social logins"],
  ]),
  ...adminSearchEntries(PAGE, I.provisioning, [
    [DIRECTORY_SYNC_LABEL, "gsuite google workspace scim workos provisioning"],
  ]),
  ...adminSearchEntries(PAGE, I.auditLogs, [
    [AUDIT_LOGS_VIEW_LABEL, "workspace activity logs audit"],
    [AUDIT_LOGS_CONFIGURE_EXPORT_LABEL, "siem export audit"],
  ]),
];
