// ===== Base types =====

// Base for items with a title and description
interface TitledItem {
  title: string;
  description: string;
}

// Base section types for composition
interface TitledSection {
  title: string;
}

interface OptionallyTitledSection {
  title?: string;
}

// Base for comparison rows (dust vs competitor)
interface ComparisonRow {
  dust: string;
  competitor: string;
}

// Shared CTA button configuration
export interface CTAConfig {
  label: string;
  href: string;
}

// ===== Comparison types =====

export type ComparisonWinner = "dust" | "competitor" | "tie";

export type FeatureStatus = "yes" | "partial" | "no";

export interface CorePositioningRow extends ComparisonRow {
  dimension: string;
}

export interface FeatureComparisonRow extends TitledItem {
  feature: string;
  dust: FeatureStatus;
  competitor: FeatureStatus;
}

export interface IntegrationComparisonRow extends ComparisonRow {
  category: string;
  winner: ComparisonWinner;
}

export interface QuickAnswerRow extends ComparisonRow {
  label: string;
}

// ===== Card types =====

export type BenefitIconType =
  | "rocket"
  | "users"
  | "dollar"
  | "chart"
  | "sparkles"
  | "chat"
  | "clock"
  | "shield";

export interface BenefitCard extends TitledItem {
  icon: BenefitIconType;
}

export interface Metric {
  value: string;
  label: string;
  description: string;
}

export interface CompetitorAdvantageCard {
  title: string;
  advantages: string[];
  counterArgument: string;
  whenToConcede: string;
}

export interface UseCaseFitItem {
  description: string;
}

// ===== Content types =====

export interface FAQItem {
  question: string;
  answer: string;
}

export interface DiscoveryQuestion {
  number: number;
  question: string;
  dustAdvantage: string;
  competitorAdvantage: string;
  whyItMatters: string;
}

export interface Testimonial {
  quote: string;
  name: string;
  title: string;
  logo: string;
  metric?: string;
}

// Generic for titled sections with a rows array
type TitledSectionWithRows<T> = TitledSection & { rows: T[] };

// ===== Section configs =====

export interface HeroConfig {
  title: string;
  subtitle: string;
  primaryCTA: CTAConfig;
  secondaryCTA: CTAConfig;
  socialProofLogos: string[];
}

export type QuickAnswerConfig = OptionallyTitledSection & {
  rows: QuickAnswerRow[];
};

export type CorePositioningConfig = TitledSectionWithRows<CorePositioningRow>;

export type FeatureComparisonConfig =
  TitledSectionWithRows<FeatureComparisonRow>;

export type WhenCompetitorBetterConfig = TitledSection & {
  cards: CompetitorAdvantageCard[];
};

export interface SocialProofConfig {
  testimonials: Testimonial[];
}

export type IntegrationComparisonConfig =
  TitledSectionWithRows<IntegrationComparisonRow>;

export type UseCaseFitConfig = TitledSection & {
  dustUseCases: UseCaseFitItem[];
  competitorUseCases: UseCaseFitItem[];
};

export type FAQSectionConfig = TitledSection & {
  items: FAQItem[];
};

export type DiscoveryQuestionsConfig = TitledSection & {
  questions: DiscoveryQuestion[];
};

export interface FinalCTAConfig {
  title: string;
  subtitle?: string;
  primaryCTA: CTAConfig;
  secondaryCTA: CTAConfig;
  trustText?: string;
  socialProofLogos?: string[];
}

export interface SEOConfig {
  title: string;
  description: string;
  ogImage?: string;
}

export type MetricsConfig = OptionallyTitledSection & {
  metrics: Metric[];
};

// ===== Layout & page config =====

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

export interface LayoutConfig {
  sections: SectionType[];
}

export interface CompetitorPageConfig {
  competitorName: string;
  competitorDisplayName: string;
  competitorLogo?: string;
  seo: SEOConfig;
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

export interface CompetitorTemplateProps {
  config: CompetitorPageConfig;
  trackingPrefix?: string;
}
