import type { InternalAllowedIconType } from "@app/components/resources/resources_icons";

export type IntegrationType = "mcp_server" | "connector" | "both";

export type IntegrationCategory =
  | "communication"
  | "productivity"
  | "crm"
  | "development"
  | "data"
  | "email"
  | "calendar"
  | "storage"
  | "support"
  | "security"
  | "ai"
  | "transcripts";

export interface IntegrationTool {
  name: string;
  displayName: string;
  description: string;
  isWriteAction: boolean;
}

export interface IntegrationBase {
  slug: string;
  name: string;
  type: IntegrationType;
  description: string;
  icon: InternalAllowedIconType;
  documentationUrl: string | null;
  authorizationRequired: boolean;
  tools: IntegrationTool[];
  category: IntegrationCategory;
  // For integrations that are both MCP and Connector
  connectorDescription?: string;
  connectorGuideUrl?: string | null;
}

export interface IntegrationUseCase {
  title: string;
  description: string;
  icon: InternalAllowedIconType;
}

export interface IntegrationFAQItem {
  question: string;
  answer: string;
}

export interface IntegrationEnrichment {
  // SEO-optimized title for the page (e.g., "AI Sales Assistant for Salesforce")
  seoTitle?: string;
  // SEO-optimized subtitle/tagline (e.g., "Automate your CRM workflows with AI agents")
  seoSubtitle?: string;
  tagline?: string;
  longDescription?: string;
  useCases?: IntegrationUseCase[];
  faq?: IntegrationFAQItem[];
  relatedIntegrations?: string[];
}

export interface IntegrationPageConfig extends IntegrationBase {
  enrichment?: IntegrationEnrichment;
}

export interface IntegrationListingPageProps {
  integrations: IntegrationBase[];
  categories: IntegrationCategory[];
}

export interface IntegrationDetailPageProps {
  integration: IntegrationPageConfig;
  relatedIntegrations: IntegrationBase[];
}

// SEO config
export interface IntegrationSEOConfig {
  title: string;
  description: string;
  canonicalUrl: string;
}
