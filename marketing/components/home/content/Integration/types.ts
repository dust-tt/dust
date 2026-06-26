import type { FAQItem } from "@marketing/components/home/content/Competitor/types";
import type { InternalAllowedIconType } from "@marketing/components/resources/resources_icons";

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
  | "transcripts"
  | "recruiting";

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
  // Icon name as returned by the integrations API — a Sparkle platform logo
  // name (e.g. "GammaLogo"). Resolve at render time via Sparkle's
  // `getPlatformLogo(name, fallback)`; front may ship logos newer than the
  // Sparkle bundled here, so a runtime fallback is required.
  icon: string;
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

// Color variants for benefit cards. The Sparkle/Tailwind palette already exposes
// `bg-X-50` / `text-X-600` pairs for these; the BenefitCard renderer maps from
// this token to the right class names.
export type BenefitCardColor =
  | "blue"
  | "green"
  | "golden"
  | "rose"
  | "pink"
  | "violet";

// One card in the IntegrationBenefitsSection. Either hand-authored in
// configs/index.ts under `enrichment.benefits`, or produced by the heuristic
// generator in utils/benefitsTemplates.ts.
export interface BenefitCard {
  icon: InternalAllowedIconType;
  color: BenefitCardColor;
  title: string;
  description: string;
  // 3-5 tool names from the partner's actual tool list (`IntegrationTool.name`).
  // Rendered as monospace chips under the description.
  toolMatches: string[];
}

// One bullet inside a ChatStoryline response section. `title` is rendered bold,
// `body` follows on the next line in muted text. Both are plain strings — no
// markdown parsing — to keep the mockup component tree small.
export interface ChatStorylineBullet {
  title: string;
  body: string;
}

export interface ChatStorylineSection {
  heading: string;
  bullets: ChatStorylineBullet[];
}

// The full scripted chat used by IntegrationChatMockupSection. Hand-authored
// in `enrichment.chatStoryline` for top partners, or produced by the heuristic
// generator in utils/chatMockupTemplates.ts.
export interface ChatStoryline {
  // What the simulated user types. Always a single line of plain text.
  userPrompt: string;
  // Tool names (`IntegrationTool.name`) that the agent "calls" — typically 3-4.
  // Must be a subset of the partner's actual tools so the chips read as real.
  toolCalls: string[];
  // Number rendered in the "Completed in Ns" agent header chip.
  completedInSeconds: number;
  // A short paragraph the agent says before the bulleted findings.
  responseIntro: string;
  // The bulleted body of the agent's response. Typically 1-3 sections.
  responseSections: ChatStorylineSection[];
  // Optional secondary prompt the agent suggests at the end ("Want me to ...?").
  followUpPrompt?: string;
}

export interface IntegrationEnrichment {
  // SEO-optimized title for the page (e.g., "AI Sales Assistant for Salesforce")
  seoTitle?: string;
  // SEO-optimized subtitle/tagline (e.g., "Automate your CRM workflows with AI agents")
  seoSubtitle?: string;
  tagline?: string;
  longDescription?: string;
  // Legacy: 2-3 hand-authored use cases rendered by UseCasesSection.
  // When set, the new BenefitsSection is suppressed to avoid duplicate JTBD
  // strips on the page (see IntegrationTemplate.tsx).
  useCases?: IntegrationUseCase[];
  // New: hand-authored benefit cards. When set, overrides the programmatic
  // generator. Should be 1-3 cards; if more, only the first 3 are rendered.
  benefits?: BenefitCard[];
  // New: hand-authored chat storyline. When set, overrides the programmatic
  // generator. When unset, IntegrationChatMockupSection still renders using
  // the heuristic engine over the partner's actual tools.
  chatStoryline?: ChatStoryline;
  faq?: FAQItem[];
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

// Helper to get human-readable type label
export function getIntegrationTypeLabel(
  type: IntegrationType,
  compact: boolean = false
): string {
  switch (type) {
    case "both":
      return compact ? "Tools & Data" : "Tools & Data Connection";
    case "mcp_server":
      return "Tools";
    case "connector":
      return compact ? "Data" : "Data Connection";
  }
}
