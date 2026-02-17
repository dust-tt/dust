import { TESTIMONIALS } from "@app/components/home/content/shared/testimonials";
import type { ReactNode } from "react";

interface VideoConfig {
  id: string;
  title: string;
  embedUrl: string;
}

interface TestimonialConfig {
  quote: string;
  name: string;
  title: string;
  logo: string;
}

interface HeroConfig {
  chip: string;
  headline: ReactNode;
  subheadline: string;
  ctaButtonText: string;
  testimonials: TestimonialConfig[];
  videos: VideoConfig[];
  usersCount: string;
}

interface FeatureSectionConfig {
  title: string;
  titleHighlight: string;
  description: string;
  features: string[];
  image: {
    src: string;
    alt: string;
  };
  imagePosition: "left" | "right";
  backgroundColor?: string;
}

interface BottomTestimonial {
  quote: string;
  name: string;
  title: string;
  avatar?: string;
  logo: string;
}

interface BottomTestimonialsConfig {
  title: string;
  subtitle: string;
  testimonials: BottomTestimonial[];
}

interface CtaConfig {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaLink: string;
}

export interface SkipConfig {
  hero: HeroConfig;
  trustedByTitle: string;
  sections: FeatureSectionConfig[];
  bottomTestimonials: BottomTestimonialsConfig;
  cta: CtaConfig;
}

export const skipConfig: SkipConfig = {
  hero: {
    chip: "",
    headline: "Welcome, Skip listeners 👋",
    subheadline:
      "You just heard about Dust on Nikhyl's show. Here's how ambitious tech professionals are using AI agents to level up their impact, and their careers.",
    ctaButtonText: "Get started",
    testimonials: [
      TESTIMONIALS.danielBaralt,
      TESTIMONIALS.everettBerryImpact,
      TESTIMONIALS.ryanWang,
    ],
    videos: [
      {
        id: "dust-in-action",
        title: "Dust in Action",
        embedUrl: "https://www.youtube.com/embed/UNrGsKCtAV0",
      },
      {
        id: "clay-dust-gtm",
        title: "Clay x Dust - GTM AI",
        embedUrl: "https://www.youtube.com/embed/kZ-Zyjjd7ns",
      },
      {
        id: "multiple-agents",
        title: "Multiple Agents",
        embedUrl: "https://www.youtube.com/embed/38vCIR2yHoA",
      },
    ],
    usersCount: "2,000+ teams already using Dust",
  },

  trustedByTitle: "TRUSTED BY AMBITIOUS TEAMS AT:",

  sections: [
    {
      title: "The career advantage",
      titleHighlight: "hiding in plain sight",
      description:
        "The best PMs, operators, and leaders don't get promoted for working harder. They get promoted for delivering more impact with less effort. While your peers are buried in Slack threads, hunting for data, and updating spreadsheets, you could be:",
      features: [
        "Shipping faster: draft PRDs, prep for meetings, and synthesize research in minutes instead of hours",
        "Making better decisions: get instant answers from your company's collective knowledge across every tool",
        "Getting credit for what matters: automate the busywork so you can focus on the strategic thinking that gets you promoted",
      ],
      image: {
        src: "/static/landing/sqagent/feature-1.png",
        alt: "AI agents working across multiple tools",
      },
      imagePosition: "right",
    },
    {
      title: "Build custom AI agents",
      titleHighlight: "in minutes",
      description:
        "No coding required. Dust Agents connect to all your tools (Slack, Notion, Drive, Salesforce, GitHub), understand your company's knowledge, and take action across your entire workflow.",
      features: [
        "A support agent that resolves tickets using your help docs and past conversations",
        "An ops agent that updates your CRM, tracks deals, and flags risks automatically",
        "A research agent that synthesizes customer feedback across every channel",
        "They work across teams, so the whole company gets smarter, not just you",
      ],
      image: {
        src: "/static/landing/sqagent/feature-2.png",
        alt: "No-code agent builder interface",
      },
      imagePosition: "left",
      backgroundColor: "bg-muted",
    },
  ],

  bottomTestimonials: {
    title: "Loved by ambitious teams",
    subtitle: "See why leading companies trust Dust to power their operations.",
    testimonials: [
      TESTIMONIALS.danielBaralt,
      TESTIMONIALS.ryanWang,
      TESTIMONIALS.everettBerryAgents,
    ],
  },

  cta: {
    title: "See how Dust can accelerate your impact",
    subtitle: "Model-agnostic • Enterprise-ready • Deploy in minutes",
    ctaText: "Get started",
    ctaLink: "/api/workos/login?screenHint=sign-up",
  },
};
