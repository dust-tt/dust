import type { FAQItem } from "@app/components/home/FAQ";
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
  copilot: string;
  guru: string;
  notion: string;
  chatgpt: string;
  gemini: string;
}

interface DustProConfig {
  pros: string[];
  testimonials: HeroTestimonial[];
}

interface PricingRow {
  product: string;
  price: string;
  includes: string;
  caveat: string;
}

interface PricingConfig {
  title: string;
  subtitle: string;
  gleanDescription: string;
  rows: PricingRow[];
}

export interface GleanLandingConfig {
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
  pricing: PricingConfig;
  comparisonTable: {
    title: string;
    rows: ComparisonTableRow[];
  };
  dustDeepDive: DustProConfig;
  faq: FAQItem[];
}

export const gleanLandingConfig: GleanLandingConfig = {
  hero: {
    headline: (
      <>
        The Best{" "}
        <span className="bg-gradient-to-r from-blue-500 to-emerald-500 bg-clip-text text-transparent">
          Glean Alternatives
        </span>
        <br />
        for Enterprise Teams
        <br />
        in 2026
      </>
    ),
    subtitle:
      "See why fast-moving companies like G2, WhatNot, Vanta, and Cursor picked Dust as their core AI agent platform.",
    ctaButtonText: "See the Comparison",
    ctaButtonLink: "#dust-deep-dive",
    secondaryButtonText: "Talk to an Expert",
    secondaryButtonLink: "/home/contact",
  },

  logoBarTitle: "2,000+ teams already building with Dust",

  whatIs: {
    title: "What is Glean?",
    description:
      "Glean is a leading enterprise search platform that indexes workplace data across 100+ integrations, providing contextual answers with strong security controls. It's powerful for finding information scattered across your company's tools.",
    catchLine: (
      <>
        But there&apos;s a catch: It&apos;s fundamentally a{" "}
        <span className="bg-gradient-to-r from-blue-500 to-emerald-500 bg-clip-text text-transparent">
          search-first tool.
        </span>{" "}
        Companies no longer want tools that just find information. They want AI
        that can understand what it found and take action on it.
      </>
    ),
    approaches: [
      {
        title: "The Glean Approach",
        variant: "warning",
        items: [
          { text: "Search-first: finds answers but can't execute tasks" },
          {
            text: "Limited workflow automation with no multi-step agent capabilities",
          },
          { text: "Opaque, custom pricing with steep tier jumps" },
        ],
      },
      {
        title: "The Dust Approach",
        variant: "positive",
        items: [
          {
            text: "Agent-first: AI teammates that search, reason, and take action",
          },
          { text: "Model-agnostic (GPT-5, Claude, Gemini)" },
          {
            text: "Transparent pricing at $29/user/month with 50+ integrations",
          },
        ],
      },
    ],
  },

  whyEvaluate: {
    title: "Why teams evaluate Glean competitors and alternatives",
    subtitle:
      "Glean is a strong enterprise search tool, but teams increasingly need AI that goes beyond finding information. They need AI that acts on it.",
    reasons: [
      {
        title: "Search alone doesn't move the needle",
        description:
          "Finding information is table stakes. Teams need AI that can take multi-step actions across systems: drafting responses, updating CRMs, triaging tickets, and executing workflows end-to-end.",
        iconColor: "amber",
      },
      {
        title: "Limited customization for specific workflows",
        description:
          "Glean's search capabilities are broad but not deep. Marketing, sales, engineering, and support each need specialized agents trained on their domain, not a generic search bar.",
        iconColor: "red",
      },
      {
        title: "Total cost is higher than it looks",
        description:
          "Glean's base license starts around $45-50/user/month, but mandatory support fees, AI add-ons, and annual renewal increases of 7-12% push total cost to $50-65+ per user. Dust offers transparent pricing at $29/user/month with no hidden fees or minimums.",
        iconColor: "purple",
      },
      {
        title: "No agent-first architecture",
        description:
          "Glean was built for search and retrofitted for AI. Dust was built from day one for agentic automation. Agents that collaborate, trigger actions, and improve over time.",
        iconColor: "blue",
      },
    ],
  },

  pricing: {
    title: "Glean pricing vs competitors",
    subtitle:
      "Glean does not publish pricing on its website. Based on industry reports, Glean's base license starts around $45-50 per user per month, with AI add-ons (~$15/user), mandatory support fees (10% of ARR), and annual renewal increases of 7-12% pushing total cost to $50-65+ per user per month.",
    gleanDescription:
      "Glean requires custom quotes for all plans, with reported minimums of 100+ seats and minimum annual contracts of $50,000-$60,000. Many teams discover unexpected costs from mandatory support fees, AI capability add-ons, and cloud hosting charges that can exceed $10,000/month for mid-sized deployments. There is no free trial or self-serve option.",
    rows: [
      {
        product: "Dust",
        price: "$29/user/month",
        includes:
          "All AI models, 50+ integrations, unlimited agents, no-code builder",
        caveat: "Transparent pricing, no minimums, 14-day free trial",
      },
      {
        product: "Glean",
        price: "Custom (est. $50-65+/user/month total)",
        includes: "Enterprise search, 100+ connectors, AI answers",
        caveat:
          "Annual contract, 100+ seat minimums, mandatory support fees, AI add-ons extra",
      },
      {
        product: "Microsoft Copilot",
        price: "$30/user/month",
        includes: "Office/Teams AI, requires Microsoft 365 subscription",
        caveat: "Add-on cost on top of existing Microsoft license",
      },
      {
        product: "Guru",
        price: "$25/user/month",
        includes: "Knowledge management, verification workflows",
        caveat: "Limited AI capabilities compared to newer platforms",
      },
      {
        product: "Notion AI",
        price: "$22/user/month",
        includes: "Workspace AI, document search, basic automation",
        caveat: "Only works within Notion, performance issues at scale",
      },
    ],
  },

  comparisonTable: {
    title: "Glean competitors and alternatives at a glance",
    rows: [
      {
        name: "Starting price",
        dust: "$29/user/month",
        copilot: "$30/user/month",
        guru: "$25/user/month",
        notion: "$22/user/month",
        chatgpt: "Custom",
        gemini: "Custom",
      },
      {
        name: "Best for",
        dust: "AI agents + company data",
        copilot: "Microsoft ecosystem",
        guru: "Sales & support teams",
        notion: "Small-medium teams",
        chatgpt: "Large organizations",
        gemini: "Google Workspace teams",
      },
      {
        name: "Task automation",
        dust: "Full multi-step agents",
        copilot: "Limited",
        guru: "Limited",
        notion: "Within Notion only",
        chatgpt: "Limited",
        gemini: "Agentic capabilities",
      },
      {
        name: "Key differentiator",
        dust: "Agent-first, 50+ integrations, no-code builder",
        copilot: "Native Office/Teams integration",
        guru: "Knowledge verification, browser extension",
        notion: "All-in-one workspace",
        chatgpt: "Brand recognition, unlimited GPT access",
        gemini: "Multi-modal analysis, Google integration",
      },
    ],
  },

  dustDeepDive: {
    pros: [
      "Agent-first architecture: AI that acts, not just answers",
      "No-code agent builder: create specialized agents in minutes",
      "Model-agnostic prevents vendor lock-in (GPT-5, Claude, Gemini)",
      "50+ native integrations (Slack, Notion, Salesforce, Zendesk)",
      "Multi-agent orchestration for complex cross-domain workflows",
      "Interactive visualizations: Frames create live dashboards and data views",
    ],
    testimonials: [
      {
        quote:
          "Dust is the most impactful software we've adopted since building Clay. It delivers immediate value while continuously getting smarter and more valuable over time.",
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

  faq: [
    {
      question: "How much does Glean cost?",
      answer: (
        <>
          <p>
            Glean does not publish pricing publicly. All plans require a custom
            quote. Based on industry reports, Glean&apos;s base license starts
            around $45-50 per user per month, with AI capabilities often adding
            ~$15/user and a mandatory support fee of 10% of ARR. Total cost per
            user typically ranges from $50-65+ per month, with minimum annual
            contracts of $50,000-$60,000 and 100+ seat requirements. In
            contrast, Dust offers transparent pricing at $29/user/month with no
            minimums and a 14-day free trial.
          </p>
        </>
      ),
    },
    {
      question: "Who are Glean's main competitors?",
      answer: (
        <>
          <p>
            The main Glean competitors in the enterprise AI space include Dust,
            Microsoft Copilot, Guru, Notion AI, ChatGPT Enterprise, and Google
            Gemini Enterprise. Each takes a different approach:
          </p>
          <ul>
            <li>
              <strong>Dust:</strong> Agent-first platform that goes beyond
              search to execute tasks and automate workflows
            </li>
            <li>
              <strong>Microsoft Copilot:</strong> Best for teams already deep in
              the Microsoft 365 ecosystem
            </li>
            <li>
              <strong>Guru:</strong> Focused on knowledge management for sales
              and support teams
            </li>
            <li>
              <strong>Notion AI:</strong> Works well for small-medium teams
              already using Notion
            </li>
            <li>
              <strong>ChatGPT Enterprise:</strong> General-purpose AI chat for
              large organizations
            </li>
            <li>
              <strong>Gemini Enterprise:</strong> Best for Google Workspace
              teams wanting search plus agentic AI
            </li>
          </ul>
        </>
      ),
    },
    {
      question: "How is Dust different from Glean?",
      answer: (
        <>
          <p>
            While Glean focuses primarily on enterprise search and finding
            information, Dust is built around AI agents that can actually
            execute tasks. With Dust, you&apos;re not just getting answers.
            You&apos;re getting AI teammates that can:
          </p>
          <ul>
            <li>Take multi-step actions across your tools</li>
            <li>Automate complex workflows without code</li>
            <li>Collaborate with multiple specialized agents</li>
            <li>Learn and improve from your team&apos;s feedback</li>
          </ul>
        </>
      ),
    },
    {
      question: "Can Dust replace our existing search tools?",
      answer: (
        <>
          <p>
            Yes. Dust includes powerful search capabilities across all your
            connected data sources, but goes further by letting you build agents
            that can act on that information. You get the best of both worlds:
            instant answers when you need them, plus AI agents that can handle
            tasks end-to-end.
          </p>
        </>
      ),
    },
    {
      question: "What makes Dust's agents different from chatbots?",
      answer: (
        <>
          <p>
            Traditional chatbots can only answer questions. Dust agents are
            fundamentally different:
          </p>
          <ul>
            <li>
              <strong>Multi-step execution:</strong> They can break down complex
              tasks and execute them across multiple tools
            </li>
            <li>
              <strong>Tool integration:</strong> Direct connections to your
              existing systems (Slack, Notion, Salesforce, etc.)
            </li>
            <li>
              <strong>Knowledge base access:</strong> Real-time access to your
              company&apos;s documentation and data
            </li>
            <li>
              <strong>Orchestration:</strong> Multiple agents can collaborate on
              complex workflows
            </li>
          </ul>
        </>
      ),
    },
    {
      question: "How quickly can we get started with Dust?",
      answer: (
        <>
          <p>
            Most teams are up and running within minutes. Our no-code builder
            means you can create your first custom agent without any technical
            expertise. Connect your data sources, configure your agent&apos;s
            instructions, and you&apos;re ready to go. For enterprise
            deployments, we offer dedicated onboarding support.
          </p>
        </>
      ),
    },
    {
      question: "Is Dust secure for enterprise use?",
      answer: (
        <>
          <p>Absolutely. Dust is built for enterprise security requirements:</p>
          <ul>
            <li>
              <strong>SOC 2 Type II certified</strong> with annual audits
            </li>
            <li>
              <strong>SSO and SCIM</strong> support for identity management
            </li>
            <li>
              <strong>Data residency options</strong> including EU hosting
            </li>
            <li>
              <strong>Your data is never used</strong> to train AI models
            </li>
            <li>
              <strong>Fine-grained permissions</strong> with Spaces and
              role-based access
            </li>
          </ul>
        </>
      ),
    },
  ],
};
