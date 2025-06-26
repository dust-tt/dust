import type { ReactNode } from "react";

// Basic config types
export interface ChipConfig {
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

export interface CTAButtonsConfig {
  primary: {
    label: string;
    href: string;
  };
  secondary: {
    label: string;
    href: string;
  };
}

export interface TestimonialCardConfig {
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
export interface HeroSectionConfig {
  chip: ChipConfig;
  title: ReactNode;
  description: string;
  ctaButtons: CTAButtonsConfig;
  testimonialCard: TestimonialCardConfig;
  decorativeShapes?: {
    topRight?: string;
    bottomLeft?: string;
  };
}

// AI Agents Section Config
export interface AIAgentsSectionConfig {
  title: string;
  description: string;
  bgColor?: string;
}

// Trusted By Section Config
export interface TrustedBySectionConfig {
  title: string;
  logoSet: string;
}

// Pain Points Section Config
export interface PainPointConfig {
  icon: string;
  title: string;
  description: string;
  color: string;
}

export interface PainPointsSectionConfig {
  title: string;
  painPoints: PainPointConfig[];
}

// Use Case Feature Config
export interface UseCaseFeatureConfig {
  icon: string;
  title: string;
  description: string;
}

export interface UseCaseConfig {
  title: string;
  image: string;
  bgColor: string;
  features: UseCaseFeatureConfig[];
}

export interface DustInActionSectionConfig {
  title: string;
  useCases: UseCaseConfig[];
}

// Impact Metrics Section Config
export interface ImpactMetricConfig {
  value: string;
  unit: string;
  type: string;
  description: string;
  bgColor?: string;
  badgeColor?: string;
  badgeTextColor?: string;
  borderRadius?: string;
}

export interface ImpactMetricsSectionConfig {
  title?: string;
  metrics: ImpactMetricConfig[];
  bgColor?: string;
}

// Demo Video Section Config
export interface DemoVideoSectionConfig {
  sectionTitle: string;
  videoUrl: string;
  showCaptions?: boolean;
}

// Testimonial Section Config
export interface TestimonialSectionConfig {
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
export interface CustomerStoryConfig {
  title: string;
  content: string;
  href: string;
  src: string;
}

export interface CustomerStoriesSectionConfig {
  title: string;
  stories: CustomerStoryConfig[];
}

// Just Use Dust Section Config
export interface JustUseDustSectionConfig {
  title: string;
  titleColor?: string;
  ctaButtons: CTAButtonsConfig;
  bgColor?: string;
  decorativeShapes?: boolean;
}

// Main Industry Config
export interface IndustryPageConfig {
  hero: HeroSectionConfig;
  aiAgents: AIAgentsSectionConfig;
  trustedBy: TrustedBySectionConfig;
  painPoints: PainPointsSectionConfig;
  dustInAction: DustInActionSectionConfig;
  impactMetrics: ImpactMetricsSectionConfig;
  demoVideo: DemoVideoSectionConfig;
  trustedBySecond?: TrustedBySectionConfig;
  testimonial: TestimonialSectionConfig;
  customerStories: CustomerStoriesSectionConfig;
  justUseDust: JustUseDustSectionConfig;
}
