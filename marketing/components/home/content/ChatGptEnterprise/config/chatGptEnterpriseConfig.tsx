import type { ReactNode } from "react";

interface HeroTestimonial {
  quote: string;
  company: string;
  author: string;
  image: string;
}

interface HeroConfig {
  headline: ReactNode;
  subtitle: string;
  ctaButtonText: string;
  ctaButtonLink: string;
  secondaryButtonText: string;
  secondaryButtonLink: string;
  testimonials: HeroTestimonial[];
}

interface ComparisonCardItem {
  text: string;
}

interface ComparisonApproach {
  title: string;
  items: ComparisonCardItem[];
  variant: "warning" | "positive";
}

interface WhyReason {
  title: string;
  description: string;
  iconColor: "amber" | "red" | "purple" | "blue";
}

interface ComparisonTableRow {
  name: string;
  dust: string;
  ms: string;
  google: string;
  claude: string;
  perplexity: string;
}

interface DustProConfig {
  pros: string[];
  testimonials: HeroTestimonial[];
}

interface CTAConfig {
  title: string;
  subtitle: string;
  buttonText: string;
  buttonLink: string;
}

export interface ChatGptEnterpriseConfig {
  hero: HeroConfig;
  logoBarTitle: string;
  whatIs: {
    title: string;
    description: string;
    catchLine: ReactNode;
    approaches: [ComparisonApproach, ComparisonApproach];
  };
  whyEvaluate: {
    title: string;
    subtitle: string;
    reasons: WhyReason[];
  };
  comparisonTable: {
    title: string;
    rows: ComparisonTableRow[];
  };
  dustDeepDive: DustProConfig;
  cta: CTAConfig;
}

export const chatGptEnterpriseConfig: ChatGptEnterpriseConfig = {
  hero: {
    headline: (
      <>
        The 6 Best <span className="text-[#1C91FF]">ChatGPT</span>
        <br />
        <span className="text-[#1C91FF]">Enterprise</span> Alternatives
        <br />
        for Teams in 2026
      </>
    ),
    subtitle:
      "See why fast moving companies picked Dust to scale AI at their company.",
    ctaButtonText: "See the Comparison",
    ctaButtonLink: "#dust-deep-dive",
    secondaryButtonText: "Talk to an Expert",
    secondaryButtonLink: "/home/contact",
    testimonials: [
      {
        quote:
          "Dust is the most impactful software we've adopted since building Clay.",
        company: "Clay",
        author: "Everett Berry, Head of GTM Engineering",
        image: "/static/landing/chatgpt-enterprise/everett.png",
      },
      {
        quote:
          "We use Dust to query our internal API documentation instantly. It's magic.",
        company: "Vanta",
        author: "Daniel Baralt, Head of AI Solutions",
        image: "/static/landing/chatgpt-enterprise/martin.png",
      },
      {
        quote:
          "The AI assistants feel like having expert teammates available 24/7.",
        company: "WhatNot",
        author: "Martin Perrin, Head of Trust & Safety",
        image: "/static/landing/chatgpt-enterprise/daniel.png",
      },
    ],
  },

  logoBarTitle: "2,000+ teams already building with Dust",

  whatIs: {
    title: "What is ChatGPT Enterprise?",
    description:
      "ChatGPT Enterprise is OpenAI's business version of ChatGPT, designed to deploy AI without compromising security. It gives you access to their most capable models with enterprise-grade admin tools.",
    catchLine: (
      <>
        But there&apos;s a catch: It&apos;s fundamentally a{" "}
        <span className="text-[#1C91FF]">single-player tool.</span>
      </>
    ),
    approaches: [
      {
        title: "The ChatGPT Approach",
        variant: "warning",
        items: [
          { text: "Isolated chat threads for each employee" },
          { text: "Locked into a single AI model (OpenAI only)" },
          {
            text: "Limited, read-only connections to your data (no fully open MCP integrations)",
          },
        ],
      },
      {
        title: "The Dust Approach",
        variant: "positive",
        items: [
          { text: "Shared AI agents acting as team infrastructure" },
          { text: "Model-agnostic (GPT-5, Claude, Gemini)" },
          {
            text: "Deep, continuous sync with 50+ data sources via MCP",
          },
        ],
      },
    ],
  },

  whyEvaluate: {
    title: "Why teams look for alternatives",
    subtitle:
      "ChatGPT Enterprise is fundamentally a single-player tool. It's great for individual productivity, but it doesn't create the compounding effect teams need at scale.",
    reasons: [
      {
        title: "Single-model dependency creates risk",
        description:
          "OpenAI-only access means no Claude for coding, no Gemini for Google integration, and vulnerability to one vendor's roadmap.",
        iconColor: "amber",
      },
      {
        title: "Limited company data integration",
        description:
          "ChatGPT Enterprise lacks deep connectors for critical systems like Salesforce, Zendesk, and Snowflake. Teams often manually upload context instead of working with live, synced knowledge.",
        iconColor: "red",
      },
      {
        title: "No specialized agents or workflows",
        description:
          "While basic GPTs exist, teams can't build multi-step workflows, trigger automations, or create department-specific agents that execute actions across systems.",
        iconColor: "purple",
      },
      {
        title: "Generic capabilities for all teams",
        description:
          "Marketing, sales, engineering, and support need different tools. ChatGPT's general-purpose design doesn't optimize for your team's specific needs, Dust gives teams AI Domain experts trained on your companies data/work.",
        iconColor: "blue",
      },
    ],
  },

  comparisonTable: {
    title: "ChatGPT Enterprise alternatives at a glance",
    rows: [
      {
        name: "Starting price",
        dust: "$29/user/month",
        ms: "$21/user/month",
        google: "$14/user/month",
        claude: "Custom",
        perplexity: "$40/user/month",
      },
      {
        name: "Best for",
        dust: "Specialized agents + company data",
        ms: "Microsoft ecosystem",
        google: "Google Workspace teams",
        claude: "Coding & long documents",
        perplexity: "Research teams",
      },
      {
        name: "Key differentiator",
        dust: "Multi-model, 50+ integrations, workflow automation",
        ms: "Native Office/Teams integration",
        google: "1M token context, Google app integration",
        claude: "Superior coding, 1M token context",
        perplexity: "Real-time search with citations",
      },
    ],
  },

  dustDeepDive: {
    pros: [
      "Model-agnostic prevents vendor lock-in (GPT-5, Sonnet 4.6, Gemini)",
      "Build domain expert AI agents in minutes without an engineer",
      "Team collaboration that scales with shared agent instructions",
      "Agents execute actions across systems via MCP protocol",
      "50+ native integrations (Slack, Notion, Salesforce, Zendesk)",
      "Interactive visualizations—Frames create live dashboards and data views",
    ],
    testimonials: [
      {
        quote:
          "Dust is the most impactful software we've adopted since building Clay.",
        company: "Clay",
        author: "Everett Berry, Head of GTM Engineering",
        image: "/static/landing/chatgpt-enterprise/everett.png",
      },
      {
        quote:
          "We use Dust to query our internal API documentation instantly. It's magic.",
        company: "Vanta",
        author: "Daniel Baralt, Head of AI Solutions",
        image: "/static/landing/chatgpt-enterprise/martin.png",
      },
      {
        quote:
          "The AI assistants feel like having expert teammates available 24/7.",
        company: "WhatNot",
        author: "Martin Perrin, Head of Trust & Safety",
        image: "/static/landing/chatgpt-enterprise/daniel.png",
      },
    ],
  },

  cta: {
    title: "Want AI that actually knows your company?",
    subtitle:
      "Join fast-moving builders like Clay, Vanta, and WhatNot who have already scaled their impact with Dust's connected AI agents.",
    buttonText: "Schedule a Demo",
    buttonLink: "/home/contact",
  },
};
