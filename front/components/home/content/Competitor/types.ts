// Winner indicator for comparison tables
export type ComparisonWinner = "dust" | "competitor" | "tie";

// Feature status for comparison tables
export type FeatureStatus = "yes" | "partial" | "no";

// Core positioning table row
export interface CorePositioningRow {
  dimension: string;
  competitor: string;
  dust: string;
}

// Feature comparison table row (data-driven, no JSX)
export interface FeatureComparisonRow {
  feature: string;
  description: string;
  dust: FeatureStatus;
  competitor: FeatureStatus;
}

// Integration comparison row
export interface IntegrationComparisonRow {
  category: string;
  dust: string;
  competitor: string;
  winner: ComparisonWinner;
}

// Benefit card for WhyChoose section (simplified)
export interface BenefitCard {
  icon: string;
  title: string;
  description: string;
}

// Metric for MetricsSection
export interface Metric {
  value: string;
  label: string;
  description: string;
}

// When competitor is better card
export interface CompetitorAdvantageCard {
  title: string;
  advantages: string[];
  counterArgument: string;
  whenToConcede: string;
}

// Use case fit item
export interface UseCaseFitItem {
  description: string;
}

// FAQ item (data-driven, plain text/markdown - no JSX)
export interface FAQItem {
  question: string;
  answer: string;
}

// Discovery question for sales section
export interface DiscoveryQuestion {
  number: number;
  question: string;
  dustAdvantage: string;
  competitorAdvantage: string;
  whyItMatters: string;
}

// Quote/testimonial
export interface Testimonial {
  quote: string;
  name: string;
  title: string;
  logo: string;
  metric?: string;
}

// Hero section config
export interface HeroConfig {
  title: string;
  subtitle: string;
  primaryCTA: {
    label: string;
    href: string;
  };
  secondaryCTA: {
    label: string;
    href: string;
  };
  socialProofLogos: string[];
}

// Quick answer row (data-driven comparison)
export interface QuickAnswerRow {
  label: string;
  dust: string;
  competitor: string;
}

// Quick answer block config (data-driven, no JSX)
export interface QuickAnswerConfig {
  title?: string;
  rows: QuickAnswerRow[];
}

// Core positioning section config
export interface CorePositioningConfig {
  title: string;
  rows: CorePositioningRow[];
}

// Feature comparison section config
export interface FeatureComparisonConfig {
  title: string;
  rows: FeatureComparisonRow[];
}

// When competitor better section config
export interface WhenCompetitorBetterConfig {
  title: string;
  cards: CompetitorAdvantageCard[];
}

// Social proof section config
export interface SocialProofConfig {
  testimonials: Testimonial[];
}

// Integration comparison section config
export interface IntegrationComparisonConfig {
  title: string;
  rows: IntegrationComparisonRow[];
}

// Use case fit section config
export interface UseCaseFitConfig {
  title: string;
  dustUseCases: UseCaseFitItem[];
  competitorUseCases: UseCaseFitItem[];
}

// FAQ section config
export interface FAQSectionConfig {
  title: string;
  items: FAQItem[];
}

// Discovery questions section config
export interface DiscoveryQuestionsConfig {
  title: string;
  questions: DiscoveryQuestion[];
}

// Final CTA section config
export interface FinalCTAConfig {
  title: string;
  subtitle?: string;
  primaryCTA: {
    label: string;
    href: string;
  };
  secondaryCTA: {
    label: string;
    href: string;
  };
  trustText?: string;
  socialProofLogos?: string[];
}

// SEO configuration
export interface SEOConfig {
  title: string;
  description: string;
  ogImage?: string;
}

// Metrics section config
export interface MetricsConfig {
  title?: string;
  metrics: Metric[];
}

// Section types for layout ordering
export type SectionType =
  | "hero"
  | "quickAnswer"
  | "corePositioning"
  | "featureComparison"
  | "whyChoose"
  | "metrics"
  | "whenCompetitorBetter"
  | "socialProof"
  | "integrationComparison"
  | "useCaseFit"
  | "faq"
  | "discoveryQuestions"
  | "finalCTA";

// Layout configuration
export interface LayoutConfig {
  sections: SectionType[];
}

// Main competitor page configuration
export interface CompetitorPageConfig {
  // Competitor info
  competitorName: string;
  competitorDisplayName: string;
  competitorLogo?: string;

  // SEO
  seo: SEOConfig;

  // Layout
  layout: LayoutConfig;

  // Sections (all optional based on layout)
  hero?: HeroConfig;
  quickAnswer?: QuickAnswerConfig;
  corePositioning?: CorePositioningConfig;
  featureComparison?: FeatureComparisonConfig;
  whyChoose?: {
    title?: string;
    benefits: BenefitCard[];
  };
  metrics?: MetricsConfig;
  whenCompetitorBetter?: WhenCompetitorBetterConfig;
  socialProof?: SocialProofConfig;
  integrationComparison?: IntegrationComparisonConfig;
  useCaseFit?: UseCaseFitConfig;
  faq?: FAQSectionConfig;
  discoveryQuestions?: DiscoveryQuestionsConfig;
  finalCTA?: FinalCTAConfig;
}

// Props for the main template
export interface CompetitorTemplateProps {
  config: CompetitorPageConfig;
  trackingPrefix?: string;
}
