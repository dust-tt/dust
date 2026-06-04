import type { Rocket02V2 } from "@dust-tt/sparkle";

export interface SeoConfig {
  title: string;
  description: string;
}

export interface pageSettingsProps {
  uptitle: string;
  title: React.ReactNode;
  description: React.ReactNode;
  accentColor: string;
  bulletPoints: string[];
  image: string;
  seo: SeoConfig;
}

export interface HeroProps {
  uptitle: string;
  title: React.ReactNode;
  description: React.ReactNode;
  accentColor?: string;
  visuals: {
    src: string;
    alt: string;
    depth: number;
  }[];
  ctaButtons: {
    primary: {
      label: string;
      href: string;
      icon: typeof Rocket02V2;
    };
    secondary: {
      label: string;
      href: string;
    };
  };
}

export interface ROIProps {
  number: string;
  subtitle: string;
  logo: string;
}
