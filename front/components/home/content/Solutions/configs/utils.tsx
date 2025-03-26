import type { RocketIcon } from "@dust-tt/sparkle";

export interface pageSettingsProps {
  uptitle: string;
  title: React.ReactNode;
  description: React.ReactNode;
  accentColor: string;
  bulletPoints: string[];
  image: string;
}

export interface HeroProps {
  uptitle: string;
  title: React.ReactNode;
  description: React.ReactNode;
  accentColor: string;
  visuals: {
    src: string;
    alt: string;
    depth: number;
  }[];
  ctaButtons: {
    primary: {
      label: string;
      href: string;
      icon: typeof RocketIcon;
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
