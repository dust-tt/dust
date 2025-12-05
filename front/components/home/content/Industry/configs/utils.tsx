import type { ReactNode } from "react";

// SEO config type
interface SeoConfig {
  title: string;
  description: string;
}

// Basic config types
interface ChipConfig {
  label: string;
  color:
    | "primary"
    | "success"
    | "warning"
    | "info"
    | "highlight"
    | "green"
    | "blue"
    | "rose"
    | "golden";
  icon: React.ComponentType;
}

interface CTAButtonsConfig {
  primary: {
    label: string;
    href: string;
  };
  secondary: {
    label: string;
    href: string;
  };
}

interface TestimonialCardConfig {
  quote: string;
  author: {
    name: string;
    title: string;
  };
  company: {
    logo: string;
    alt: string;
  };
  bgColor: string;
  textColor: string;
}

// Hero Section Config
interface HeroSectionConfig {
  chip: ChipConfig;
  title: ReactNode;
  description: string;
  ctaButtons: CTAButtonsConfig;
  testimonialCard?: TestimonialCardConfig;
  heroImage?: {
    src: string;
    alt: string;
  };
  decorativeShapes?: {
    topRight?: string;
    bottomLeft?: string;
  };
}

// AI Agents Section Config
interface AIAgentsSectionConfig {
  title: string;
  description: string;
  bgColor?: string;
}

// Trusted By Section Config
interface TrustedBySectionConfig {
  title: string;
  logoSet: string;
}

// Pain Points Section Config
interface PainPointConfig {
  icon: string;
  title: string;
  description: string;
  color: string;
}

interface PainPointsSectionConfig {
  title: string;
  painPoints: PainPointConfig[];
}

// Use Case Feature Config
interface UseCaseFeatureConfig {
  icon: string;
  title: string;
  description: string;
}

interface UseCaseConfig {
  title: string;
  image: string;
  bgColor: string;
  features: UseCaseFeatureConfig[];
}

interface DustInActionSectionConfig {
  title: string;
  useCases: UseCaseConfig[];
}

// Impact Metrics Section Config
interface ImpactMetricConfig {
  value: string;
  unit: string;
  type: string;
  description: string;
  bgColor?: string;
  badgeColor?: string;
  badgeTextColor?: string;
  borderRadius?: string;
}

interface ImpactMetricsSectionConfig {
  title?: string;
  metrics: ImpactMetricConfig[];
  bgColor?: string;
}

// Demo Video Section Config
interface DemoVideoSectionConfig {
  sectionTitle: string;
  videoUrl: string;
  showCaptions?: boolean;
}

// Testimonial Section Config
interface TestimonialSectionConfig {
  quote: string;
  author: {
    name: string;
    title: string;
  };
  company: {
    logo: string;
    alt: string;
  };
  bgColor?: string;
  textColor?: string;
}

// Customer Story Config
interface CustomerStoryConfig {
  title: string;
  content: string;
  href: string;
  src: string;
}

interface CustomerStoriesSectionConfig {
  title: string;
  stories: CustomerStoryConfig[];
}

// Just Use Dust Section Config
interface JustUseDustSectionConfig {
  title: string;
  titleColor?: string;
  ctaButtons: CTAButtonsConfig;
  bgColor?: string;
  decorativeShapes?: boolean;
}

// Section Types and Layout Configuration
export type SectionType =
  | "hero"
  | "aiAgents"
  | "trustedBy"
  | "painPoints"
  | "dustInAction"
  | "impactMetrics"
  | "demoVideo"
  | "trustedBySecond"
  | "testimonial"
  | "customerStories"
  | "justUseDust";

interface SectionConfig {
  type: SectionType;
  enabled?: boolean; // Allows sections to be disabled
}

interface LayoutConfig {
  sections: SectionConfig[];
}

// Main Industry Config (Updated)
export interface IndustryPageConfig {
  // SEO configuration
  seo: SeoConfig;

  // Layout configuration - NEW
  layout: LayoutConfig;

  // Section configurations (now all optional)
  hero?: HeroSectionConfig;
  aiAgents?: AIAgentsSectionConfig;
  trustedBy?: TrustedBySectionConfig;
  painPoints?: PainPointsSectionConfig;
  dustInAction?: DustInActionSectionConfig;
  impactMetrics?: ImpactMetricsSectionConfig;
  demoVideo?: DemoVideoSectionConfig;
  trustedBySecond?: TrustedBySectionConfig;
  testimonial?: TestimonialSectionConfig;
  customerStories?: CustomerStoriesSectionConfig;
  justUseDust?: JustUseDustSectionConfig;
}

// Utility functions for section management
const defaultSectionOrder: SectionType[] = [
  "hero",
  "aiAgents",
  "trustedBy",
  "painPoints",
  "dustInAction",
  "impactMetrics",
  "demoVideo",
  "trustedBySecond",
  "testimonial",
  "customerStories",
  "justUseDust",
];

export function createLayoutConfig(
  sections: (SectionType | SectionConfig)[]
): LayoutConfig {
  return {
    sections: sections.map((section) =>
      typeof section === "string" ? { type: section, enabled: true } : section
    ),
  };
}

// Helper function to get enabled sections in order
export function getEnabledSections(layout: LayoutConfig): SectionType[] {
  return layout.sections
    .filter((section) => section.enabled !== false)
    .map((section) => section.type);
}
