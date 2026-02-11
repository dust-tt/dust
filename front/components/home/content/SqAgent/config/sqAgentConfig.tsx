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

export interface SqAgentConfig {
  hero: HeroConfig;
  trustedByTitle: string;
  sections: FeatureSectionConfig[];
  bottomTestimonials: BottomTestimonialsConfig;
  cta: CtaConfig;
}

export const sqAgentConfig: SqAgentConfig = {
  hero: {
    chip: "",
    headline: (
      <>
        <span className="text-foreground">Squarespace</span>
        <br />
        <span className="text-foreground">for</span>
        <br />
        <span className="bg-gradient-to-r from-blue-500 to-emerald-500 bg-clip-text pr-1 text-transparent">
          AI Agents
        </span>
      </>
    ),
    subheadline:
      "Spin up AI teammates that know your business, use your tools, and work safely alongside your team.",
    ctaButtonText: "Start Free Trial",
    testimonials: [
      {
        quote:
          "We've reduced our response time by 73% and our team loves using it daily.",
        name: "Daniel Banet",
        title: "Head of AI Solutions",
        logo: "/static/landing/logos/gray/vanta.svg",
      },
      {
        quote:
          "Dust is the most impactful software we've adopted since building Clay. It delivers immediate value while continuously getting smarter.",
        name: "Everett Berry",
        title: "GTM Eng Lead, Clay",
        logo: "/static/landing/logos/gray/clay.svg",
      },
      {
        quote:
          "The data analyst job is dead. We'll only have business analysts now.",
        name: "Inès Delbecq",
        title: "AI Lead, Electra",
        logo: "/static/landing/logos/gray/electra.svg",
      },
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

  trustedByTitle: "TRUSTED BY LEADING B2B SAAS COMPANIES",

  sections: [
    {
      title: "Stop context-switching.",
      titleHighlight: "Start scaling.",
      description:
        "Why spend hours searching for information, asking already answered questions, and manually uploading data/files?",
      features: [
        "Connect to 50+ integrations including Slack, Notion, and Salesforce",
        "Custom AI assistants trained on your company's knowledge",
        "Real-time collaboration and handoffs between AI and humans",
        "Complete audit trail and analytics dashboard",
      ],
      image: {
        src: "/static/landing/sqagent/feature-1.png",
        alt: "AI agents working across multiple tools",
      },
      imagePosition: "right",
    },
    {
      title: "Create AI Agents in seconds,",
      titleHighlight: "no consultants needed",
      description:
        "Build powerful AI agents without an engineer. Connect them to company data, customize their capabilities, and deploy in minutes.",
      features: [
        "No-code agent builder with templates",
        "Customize agent behavior and permissions",
        "Deploy to Slack, web, or API",
        "Track performance and iterate quickly",
      ],
      image: {
        src: "/static/landing/sqagent/feature-2.png",
        alt: "No-code agent builder interface",
      },
      imagePosition: "left",
      backgroundColor: "bg-muted",
    },
    {
      title: "Connect all your data",
      titleHighlight: "easily and securely",
      description:
        'Build a central "AI Brain" with all of your company knowledge across Slack, Google Drive, Notion, HubSpot, GitHub, and more, safely and securely.',
      features: [
        "50+ native integrations out of the box",
        "Real-time sync keeps data fresh",
        "Granular access controls and permissions",
        "SOC 2 Type II certified",
      ],
      image: {
        src: "/static/landing/sqagent/feature-3.png",
        alt: "Secure data connections",
      },
      imagePosition: "right",
    },
    {
      title: "Go beyond search",
      titleHighlight: "and chat",
      description:
        "Dust agents can use multiple tools and produce concrete deliverables: data analyses, lead scoring, automated sales emails, and so much more.",
      features: [
        "Advanced reasoning across multiple sources",
        "Data analysis and visualization",
        "Knowledge search with context",
        "Automated workflows and actions",
      ],
      image: {
        src: "/static/landing/sqagent/feature-4.png",
        alt: "AI agents producing deliverables",
      },
      imagePosition: "left",
      backgroundColor: "bg-muted",
    },
  ],

  bottomTestimonials: {
    title: "Loved by teams everywhere",
    subtitle:
      "See why leading B2B companies trust Dust to power their operations.",
    testimonials: [
      {
        quote:
          '"The data analyst job is dead. We\'ll only have business analysts now."',
        name: "Inès Delbecq",
        title: "AI Lead, Electra",
        logo: "/static/landing/logos/gray/electra.svg",
      },
      {
        quote:
          '"Allows us to create qualitative deliverables, not only search/answer questions"',
        name: "Ryan Wang",
        title: "CEO, Assembled",
        logo: "/static/landing/logos/gray/assembled.svg",
      },
      {
        quote:
          '"I have Dust agents for vendor research, interviewing, and even to check changes in our knowledge base, endless possibilities with the platform."',
        name: "Everett Berry",
        title: "GTM Eng Lead, Clay",
        logo: "/static/landing/logos/gray/clay.svg",
      },
    ],
  },

  cta: {
    title: "Ready to transform your team?",
    subtitle:
      "Join our crew of fast moving builders like Clay, Vanta, and WhatNot :)",
    ctaText: "Schedule a demo",
    ctaLink: "/home/contact",
  },
};
