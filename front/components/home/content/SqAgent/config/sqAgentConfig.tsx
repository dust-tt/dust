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
  visualComponent?: ReactNode;
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
      TESTIMONIALS.danielBaralt,
      TESTIMONIALS.everettBerryImpact,
      TESTIMONIALS.inesDelbecq,
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
        src: "/static/landing/enterprise/section2/plays_nicely.png",
        alt: "AI agents working across multiple tools",
      },
      imagePosition: "right",
      visualComponent: (
        <div className="w-full rounded-2xl border border-border/50 bg-card p-8 shadow-xl">
          <div className="space-y-6">
            <div className="flex items-center gap-4 rounded-xl bg-muted/50 p-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 text-sm font-semibold text-amber-700">
                JD
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  How do I set up SSO for enterprise?
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5 text-white"
                  aria-hidden="true"
                >
                  <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
                  <path d="M20 2v4" />
                  <path d="M22 4h-4" />
                  <circle cx="4" cy="20" r="2" />
                </svg>
              </div>
              <div className="flex-1 space-y-2">
                <p className="text-sm font-medium text-primary">
                  Dust Assistant
                </p>
                <p className="text-sm text-muted-foreground">
                  To set up SSO for enterprise accounts, navigate to Settings →
                  Security → Single Sign-On. You'll need your IdP metadata
                  URL...
                </p>
                <div className="flex gap-2 pt-2">
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
                    Documentation
                  </span>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
                    Setup Guide
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
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
        src: "/static/landing/enterprise/section2/customize.png",
        alt: "No-code agent builder interface",
      },
      imagePosition: "left",
      backgroundColor: "bg-muted",
      visualComponent: (
        <div className="w-full rounded-2xl bg-amber-50 p-6 shadow-lg">
          <div className="rounded-xl border border-border/30 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-sm font-semibold">New Agent</span>
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Instructions
                </p>
                <p className="mb-3 text-xs text-muted-foreground">
                  The instructions that your assistant will follow.
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded bg-muted px-2 py-1 text-xs">
                    sent
                  </span>
                  <span className="rounded bg-muted px-2 py-1 text-xs">
                    Chat request
                  </span>
                  <span className="rounded bg-muted px-2 py-1 text-xs">
                    Motion
                  </span>
                  <span className="rounded bg-muted px-2 py-1 text-xs">
                    Spouse pro
                  </span>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs text-muted-foreground">
                  Knowledge &amp; Tools
                </p>
                <div className="flex flex-wrap gap-2">
                  {["📊", "⚡", "🔗", "❌", "✉️", "🔒", "📁", "💬"].map(
                    (emoji) => (
                      <div
                        key={emoji}
                        className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-sm"
                      >
                        {emoji}
                      </div>
                    )
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700">
                    Add knowledge
                  </span>
                  <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium">
                    Add tools
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
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
        src: "/static/landing/enterprise/section2/security_permissions.png",
        alt: "Secure data connections",
      },
      imagePosition: "right",
      visualComponent: (
        <div className="relative w-full rounded-2xl bg-sky-50 p-6">
          <div className="absolute -top-4 left-1/2 flex -translate-x-1/2 gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm shadow-md">
              🔗
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm shadow-md">
              ⚡
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm shadow-md">
              📝
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-border/30 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Chat</span>
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
                  Knowledge
                </span>
              </div>
            </div>
            <div className="mb-4 space-y-2 text-xs text-muted-foreground">
              <p>📄 Using Sync from Single Media Report...</p>
              <p>📄 Evaluate Generative AI for Marketing...</p>
              <p>📊 Responding to Emerging New Risks and...</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded bg-primary/20">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3 text-primary"
                    aria-hidden="true"
                  >
                    <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
                    <path d="M20 2v4" />
                    <path d="M22 4h-4" />
                    <circle cx="4" cy="20" r="2" />
                  </svg>
                </div>
                <span className="text-xs font-medium">@Dustagent</span>
                <span className="text-xs text-muted-foreground">
                  Salesforce
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Hey Rob! 👋 Start a conversation...
              </p>
            </div>
          </div>
        </div>
      ),
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
        src: "/static/landing/enterprise/section4/data_analyst.png",
        alt: "AI agents producing deliverables",
      },
      imagePosition: "left",
      backgroundColor: "bg-muted",
      visualComponent: (
        <div className="w-full rounded-2xl bg-emerald-50 p-8">
          <div className="relative mx-auto aspect-square w-full max-w-sm">
            <div className="absolute inset-0 rounded-full border-2 border-emerald-200/50" />
            <div className="absolute inset-8 rounded-full border-2 border-emerald-300/50" />
            <div className="absolute inset-16 rounded-full border-2 border-emerald-400/50" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-800 shadow-xl">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-8 w-8 text-white"
                  aria-hidden="true"
                >
                  <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
                  <path d="M20 2v4" />
                  <path d="M22 4h-4" />
                  <circle cx="4" cy="20" r="2" />
                </svg>
              </div>
            </div>
            <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700">
              ⚡ Advanced reasoning
            </div>
            <div className="absolute bottom-12 left-4 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700">
              🔍 Knowledge Search
            </div>
            <div className="absolute bottom-4 right-4 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700">
              📊 Data analysis
            </div>
            <div className="absolute right-0 top-1/3 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm shadow-md">
              📧
            </div>
            <div className="absolute left-0 top-1/2 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm shadow-md">
              📁
            </div>
            <div className="absolute bottom-1/3 right-8 flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sm shadow-md">
              ⭐
            </div>
          </div>
        </div>
      ),
    },
  ],

  bottomTestimonials: {
    title: "Loved by teams everywhere",
    subtitle:
      "See why leading B2B companies trust Dust to power their operations.",
    testimonials: [
      TESTIMONIALS.inesDelbecq,
      TESTIMONIALS.ryanWang,
      TESTIMONIALS.everettBerryAgents,
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
