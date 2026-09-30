/**
 * Stable ids for admin page sections. Used as `data-admin-section` values and
 * as search-index section ids. Keep values unique across pages (they become
 * URL hashes). Keep in sync with the wrappers that render those sections.
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
  usage: {
    members: "usage-members",
    groups: "usage-groups",
    topUps: "usage-top-ups",
    spendingPolicies: "usage-spending-policies",
    costManagement: "usage-cost-management",
    modelTiers: "usage-model-tiers",
    programmatic: "usage-programmatic",
    notifications: "usage-notifications",
  },
  billing: {
    information: "billing-information",
    invoices: "billing-invoices",
    coupons: "billing-coupons",
  },
  apiKeys: {
    keys: "api-keys",
  },
  automations: {
    triggers: "automations-triggers",
    slackWorkflows: "automations-slack-workflows",
  },
  secrets: {
    secrets: "dev-secrets",
  },
  computer: {
    agentDomains: "computer-agent-domains",
    network: "computer-network",
    environment: "computer-environment",
  },
  selfImprovingSkills: {
    settings: "self-improving-settings",
    consumption: "self-improving-consumption",
    skills: "self-improving-skills-list",
  },
} as const;

export type GovernanceSectionId =
  (typeof ADMIN_SECTION_IDS.governance)[keyof typeof ADMIN_SECTION_IDS.governance];

export type IdentitySectionId =
  (typeof ADMIN_SECTION_IDS.identity)[keyof typeof ADMIN_SECTION_IDS.identity];

export type UsageSectionId =
  (typeof ADMIN_SECTION_IDS.usage)[keyof typeof ADMIN_SECTION_IDS.usage];

export type BillingSectionId =
  (typeof ADMIN_SECTION_IDS.billing)[keyof typeof ADMIN_SECTION_IDS.billing];

export type ApiKeysSectionId =
  (typeof ADMIN_SECTION_IDS.apiKeys)[keyof typeof ADMIN_SECTION_IDS.apiKeys];

export type AutomationsSectionId =
  (typeof ADMIN_SECTION_IDS.automations)[keyof typeof ADMIN_SECTION_IDS.automations];

export type SecretsSectionId =
  (typeof ADMIN_SECTION_IDS.secrets)[keyof typeof ADMIN_SECTION_IDS.secrets];

export type ComputerSectionId =
  (typeof ADMIN_SECTION_IDS.computer)[keyof typeof ADMIN_SECTION_IDS.computer];

export type SelfImprovingSkillsSectionId =
  (typeof ADMIN_SECTION_IDS.selfImprovingSkills)[keyof typeof ADMIN_SECTION_IDS.selfImprovingSkills];

export type AdminSectionId =
  | GovernanceSectionId
  | IdentitySectionId
  | UsageSectionId
  | BillingSectionId
  | ApiKeysSectionId
  | AutomationsSectionId
  | SecretsSectionId
  | ComputerSectionId
  | SelfImprovingSkillsSectionId;

/** Flat list of every declared admin section id (for drift checks). */
export function allAdminSectionIds(): AdminSectionId[] {
  return [
    ...Object.values(ADMIN_SECTION_IDS.governance),
    ...Object.values(ADMIN_SECTION_IDS.identity),
    ...Object.values(ADMIN_SECTION_IDS.usage),
    ...Object.values(ADMIN_SECTION_IDS.billing),
    ...Object.values(ADMIN_SECTION_IDS.apiKeys),
    ...Object.values(ADMIN_SECTION_IDS.automations),
    ...Object.values(ADMIN_SECTION_IDS.secrets),
    ...Object.values(ADMIN_SECTION_IDS.computer),
    ...Object.values(ADMIN_SECTION_IDS.selfImprovingSkills),
  ];
}
