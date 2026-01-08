import type { CompetitorPageConfig } from "../types";

export const gleanConfig: CompetitorPageConfig = {
  competitorName: "glean",
  competitorDisplayName: "Glean",
  competitorLogo: "/static/landing/compare/glean.svg",

  seo: {
    title: "Best Glean Alternative for AI Agent Workflows | Dust",
    description:
      "Compare Dust to Glean for enterprise AI. Agent-first platform with 70-90% adoption, transparent pricing from $29/user, multi-agent orchestration, and proven ROI. Trusted by Clay, Vanta, Qonto.",
  },

  layout: {
    sections: [
      "hero",
      "quickAnswer",
      "featureComparison",
      "whyChoose",
      "metrics",
      "faq",
      "finalCTA",
    ],
  },

  hero: {
    title: "The Best Glean Alternative for AI Agent Workflows",
    subtitle:
      "Agent-first platform that teams actually use—70-90% adoption, transparent pricing, no $50K+ commitments",
    primaryCTA: {
      label: "Start Free Trial",
      href: "/home/pricing",
    },
    secondaryCTA: {
      label: "Book a Demo",
      href: "/home/contact",
    },
    socialProofLogos: [],
  },

  quickAnswer: {
    title: "The Key Differences",
    rows: [
      {
        label: "Architecture",
        dust: "Agent-first from day one",
        competitor: "Search-first, agents added later",
      },
      {
        label: "Pricing",
        dust: "$29/user/month, transparent",
        competitor: "$50K+ minimum, hidden pricing",
      },
      {
        label: "Adoption",
        dust: "70-90% team adoption",
        competitor: "~40% typical adoption",
      },
      {
        label: "Time to value",
        dust: "5-minute agent creation",
        competitor: "Complex setup required",
      },
    ],
  },

  featureComparison: {
    title: "How Dust Compares to Glean",
    rows: [
      {
        feature: "Agent-first architecture",
        description: "Built from day one for workflow automation, not search",
        dust: "yes",
        competitor: "partial",
      },
      {
        feature: "No-code agent builder",
        description: "Create agents in 5 minutes without technical knowledge",
        dust: "yes",
        competitor: "partial",
      },
      {
        feature: "Multi-agent orchestration",
        description: "Parallel sub-agents for complex cross-system workflows",
        dust: "yes",
        competitor: "partial",
      },
      {
        feature: "20+ AI models",
        description: "GPT-4, Claude, Gemini, Mistral—choose per task",
        dust: "yes",
        competitor: "yes",
      },
      {
        feature: "Transparent pricing",
        description: "$29/user/month with no hidden fees or minimums",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "50+ integrations",
        description: "Slack, Notion, Salesforce, GitHub, and more",
        dust: "yes",
        competitor: "yes",
      },
      {
        feature: "Write actions (CRM, tickets)",
        description: "Update records, create docs, post messages",
        dust: "yes",
        competitor: "yes",
      },
      {
        feature: "Interactive dashboards (Frames)",
        description: "Real-time React components for data visualization",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "SOC 2 Type II certified",
        description: "Enterprise-grade security and compliance",
        dust: "yes",
        competitor: "yes",
      },
      {
        feature: "Self-hosted deployment",
        description: "Deploy in your own cloud infrastructure",
        dust: "no",
        competitor: "yes",
      },
    ],
  },

  whyChoose: {
    title: "Why teams switch from Glean to Dust",
    benefits: [
      {
        icon: "rocket",
        title: "Agent-first architecture",
        description:
          "Built from day one for workflow automation, not search with AI added later. Create agents that do work, not just find information.",
      },
      {
        icon: "users",
        title: "70-90% adoption rates",
        description:
          "Teams actually use Dust daily. Our no-code builder lets marketing, sales, and support create their own agents in 5 minutes.",
      },
      {
        icon: "dollar",
        title: "Transparent pricing",
        description:
          "$29/user/month with no hidden costs. No $50K minimums, no paid POCs, no surprise implementation fees.",
      },
      {
        icon: "sparkles",
        title: "20+ AI models",
        description:
          "Switch between GPT-4, Claude, Gemini, and Mistral as better models launch. Choose the best model for each task.",
      },
      {
        icon: "chart",
        title: "Multi-agent orchestration",
        description:
          "Parallel sub-agents handle complex workflows across systems. Research, analyze, write, and review simultaneously.",
      },
      {
        icon: "chat",
        title: "Write actions, not just search",
        description:
          "Update Salesforce, create Notion docs, post to Slack. Agents that do work across 50+ integrations.",
      },
    ],
  },

  metrics: {
    title: "Why teams choose Dust",
    metrics: [
      {
        value: "70-90%",
        label: "Adoption rate",
        description: "vs. 40% industry average",
      },
      {
        value: "5 min",
        label: "Agent creation",
        description: "No-code builder",
      },
      {
        value: "$29",
        label: "Per user/month",
        description: "Transparent pricing",
      },
    ],
  },

  faq: {
    title: "Frequently Asked Questions",
    items: [
      {
        question: "Is Dust a drop-in replacement for Glean?",
        answer:
          "Yes—with a key difference. Glean excels at enterprise search, while Dust excels at agentic workflows. If your team needs to automate work—triaging tickets, updating CRMs, drafting reports—Dust delivers higher adoption (70-90% vs. 40%) and faster ROI.",
      },
      {
        question: "How does Dust's pricing compare to Glean?",
        answer:
          "Glean: No public pricing, $50K+ minimum ACV, paid POCs up to $70K. Dust: $29/user/month Pro, ~$45/user Enterprise. 14-day free trial, no credit card required.",
      },
      {
        question: "Does Dust support multi-agent workflows?",
        answer:
          "Yes. Dust enables teams of specialized agents that collaborate: research agent gathers data, analysis agent processes it, writing agent drafts reports. Parallel execution for faster results.",
      },
      {
        question: "Can Dust match Glean's search quality?",
        answer:
          "For pure enterprise search, Glean's ex-Google engineers have an edge. But 95% of teams need good search + workflow automation. Dust delivers both at half the cost.",
      },
      {
        question: "What security certifications does Dust have?",
        answer:
          "SOC 2 Type II, GDPR, and HIPAA-ready. SSO/SAML, SCIM, RBAC, audit logs, US/EU data residency, zero data retention options.",
      },
      {
        question: "Can I try Dust before committing?",
        answer:
          "Yes. 14-day free trial—no credit card required. Full access to agent building, 50+ integrations, and multi-agent orchestration.",
      },
    ],
  },

  finalCTA: {
    title: "Ready to Move Beyond Search-First AI?",
    subtitle: "See why 2,000+ organizations choose agent-first workflows",
    primaryCTA: {
      label: "Start Free Trial",
      href: "/home/pricing",
    },
    secondaryCTA: {
      label: "Book a Demo",
      href: "/home/contact",
    },
    trustText: "14-day free trial. Cancel anytime. No credit card required.",
  },
};
