import type { FAQItem } from "@app/components/home/FAQ";
import type { ReactNode } from "react";

export interface HeroConfig {
  chip: string;
  headline: ReactNode;
  postItText: ReactNode;
  valuePropTitle?: string;
  valueProps?: string[];
  ctaButtonText: string;
  trustBadges: string[];
}

export type FeatureStatus = "yes" | "no" | "partial";

export interface ComparisonFeature {
  name: string;
  description?: string;
  dust: FeatureStatus;
  competitor: FeatureStatus;
}

export interface ComparisonConfig {
  dustHeader: string;
  competitorHeader: string;
  features: ComparisonFeature[];
}

export interface Testimonial {
  quote: string;
  name: string;
  title: string;
  logo: string;
}

export type IconType = "robot" | "bolt" | "book" | "users";
export type IconColor = "green" | "orange" | "blue" | "red";

export interface Differentiator {
  title: string;
  description: string;
  iconColor: IconColor;
  icon: IconType;
}

export interface Stat {
  value: string;
  label: string;
  company: string;
  logo: string;
}

export interface CTAConfig {
  title: string;
  subtitle: string;
  buttonText: string;
  trustBadges: string[];
}

export interface CompetitiveLandingConfig {
  hero: HeroConfig;
  comparison: ComparisonConfig;
  testimonials: Testimonial[];
  differentiators: Differentiator[];
  stats: Stat[];
  faq: FAQItem[];
  cta: CTAConfig;
}
