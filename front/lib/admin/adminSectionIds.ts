/**
 * Stable ids for admin page sections. Used as `data-admin-section` values and
 * (later) as search-index section ids. Keep in sync with the wrappers that render
 * those sections.
 */
export const ADMIN_SECTION_IDS = {
  governance: {
    agents: "agents",
    skills: "skills",
    automations: "automations",
    frame: "frame",
    billing: "billing",
    roles: "roles",
    pods: "pods",
    features: "features",
    messaging: "messaging",
    audit: "audit",
  },
  identity: {
    domain: "domain",
    sso: "sso",
    provisioning: "provisioning",
    auditLogs: "audit-logs",
  },
} as const;

export type GovernanceSectionId =
  (typeof ADMIN_SECTION_IDS.governance)[keyof typeof ADMIN_SECTION_IDS.governance];

export type IdentitySectionId =
  (typeof ADMIN_SECTION_IDS.identity)[keyof typeof ADMIN_SECTION_IDS.identity];

export type AdminSectionId = GovernanceSectionId | IdentitySectionId;

/** Flat list of every declared admin section id (for drift checks). */
export function allAdminSectionIds(): AdminSectionId[] {
  return [
    ...Object.values(ADMIN_SECTION_IDS.governance),
    ...Object.values(ADMIN_SECTION_IDS.identity),
  ];
}
