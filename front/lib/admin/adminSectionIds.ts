/**
 * Stable ids for admin page sections. Used as `data-admin-section` values and
 * as search-index section ids. Keep values unique across pages (they become
 * URL hashes). Keep in sync with the wrappers that render those sections.
 */
export const ADMIN_SECTION_IDS = {
  people: {
    members: "people-members",
    groups: "people-groups",
  },
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
  branding: {
    branding: "workspace-branding",
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
  modelProviders: {
    providers: "model-providers",
  },
  analytics: {
    consumption: "analytics-consumption",
  },
  billing: {
    information: "billing-information",
    invoices: "billing-invoices",
    coupons: "billing-coupons",
  },
  subscription: {
    plan: "subscription-plan",
  },
  apiKeys: {
    keys: "api-keys",
  },
  creditsUsage: {
    credits: "credits-usage",
  },
  automations: {
    triggers: "automations-triggers",
    slackWorkflows: "automations-slack-workflows",
  },
  appCredentials: {
    modelProviders: "app-credentials-models",
    serviceProviders: "app-credentials-services",
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

export type PeopleSectionId =
  (typeof ADMIN_SECTION_IDS.people)[keyof typeof ADMIN_SECTION_IDS.people];

export type GovernanceSectionId =
  (typeof ADMIN_SECTION_IDS.governance)[keyof typeof ADMIN_SECTION_IDS.governance];

export type IdentitySectionId =
  (typeof ADMIN_SECTION_IDS.identity)[keyof typeof ADMIN_SECTION_IDS.identity];

export type BrandingSectionId =
  (typeof ADMIN_SECTION_IDS.branding)[keyof typeof ADMIN_SECTION_IDS.branding];

export type UsageSectionId =
  (typeof ADMIN_SECTION_IDS.usage)[keyof typeof ADMIN_SECTION_IDS.usage];

export type ModelProvidersSectionId =
  (typeof ADMIN_SECTION_IDS.modelProviders)[keyof typeof ADMIN_SECTION_IDS.modelProviders];

export type AnalyticsSectionId =
  (typeof ADMIN_SECTION_IDS.analytics)[keyof typeof ADMIN_SECTION_IDS.analytics];

export type BillingSectionId =
  (typeof ADMIN_SECTION_IDS.billing)[keyof typeof ADMIN_SECTION_IDS.billing];

export type SubscriptionSectionId =
  (typeof ADMIN_SECTION_IDS.subscription)[keyof typeof ADMIN_SECTION_IDS.subscription];

export type ApiKeysSectionId =
  (typeof ADMIN_SECTION_IDS.apiKeys)[keyof typeof ADMIN_SECTION_IDS.apiKeys];

export type CreditsUsageSectionId =
  (typeof ADMIN_SECTION_IDS.creditsUsage)[keyof typeof ADMIN_SECTION_IDS.creditsUsage];

export type AutomationsSectionId =
  (typeof ADMIN_SECTION_IDS.automations)[keyof typeof ADMIN_SECTION_IDS.automations];

export type AppCredentialsSectionId =
  (typeof ADMIN_SECTION_IDS.appCredentials)[keyof typeof ADMIN_SECTION_IDS.appCredentials];

export type SecretsSectionId =
  (typeof ADMIN_SECTION_IDS.secrets)[keyof typeof ADMIN_SECTION_IDS.secrets];

export type ComputerSectionId =
  (typeof ADMIN_SECTION_IDS.computer)[keyof typeof ADMIN_SECTION_IDS.computer];

export type SelfImprovingSkillsSectionId =
  (typeof ADMIN_SECTION_IDS.selfImprovingSkills)[keyof typeof ADMIN_SECTION_IDS.selfImprovingSkills];

export type AdminSectionId =
  | PeopleSectionId
  | GovernanceSectionId
  | IdentitySectionId
  | BrandingSectionId
  | UsageSectionId
  | ModelProvidersSectionId
  | AnalyticsSectionId
  | BillingSectionId
  | SubscriptionSectionId
  | ApiKeysSectionId
  | CreditsUsageSectionId
  | AutomationsSectionId
  | AppCredentialsSectionId
  | SecretsSectionId
  | ComputerSectionId
  | SelfImprovingSkillsSectionId;

/** Flat list of every declared admin section id (for drift checks). */
export function allAdminSectionIds(): AdminSectionId[] {
  return [
    ...Object.values(ADMIN_SECTION_IDS.people),
    ...Object.values(ADMIN_SECTION_IDS.governance),
    ...Object.values(ADMIN_SECTION_IDS.identity),
    ...Object.values(ADMIN_SECTION_IDS.branding),
    ...Object.values(ADMIN_SECTION_IDS.usage),
    ...Object.values(ADMIN_SECTION_IDS.modelProviders),
    ...Object.values(ADMIN_SECTION_IDS.analytics),
    ...Object.values(ADMIN_SECTION_IDS.billing),
    ...Object.values(ADMIN_SECTION_IDS.subscription),
    ...Object.values(ADMIN_SECTION_IDS.apiKeys),
    ...Object.values(ADMIN_SECTION_IDS.creditsUsage),
    ...Object.values(ADMIN_SECTION_IDS.automations),
    ...Object.values(ADMIN_SECTION_IDS.appCredentials),
    ...Object.values(ADMIN_SECTION_IDS.secrets),
    ...Object.values(ADMIN_SECTION_IDS.computer),
    ...Object.values(ADMIN_SECTION_IDS.selfImprovingSkills),
  ];
}
