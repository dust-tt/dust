import type { CompetitorPageConfig } from "../types";

export const geminiConfig: CompetitorPageConfig = {
  competitorName: "gemini",
  competitorDisplayName: "Gemini Enterprise",
  competitorLogo: "/static/landing/compare/gemini.svg",

  seo: {
    title: "Best Gemini Enterprise Alternative for Multi-Model AI Agents | Dust",
    description:
      "Compare Dust to Gemini Enterprise. Deploy AI agents accessible from Slack, Teams, Chrome with 20+ integrations, multi-model flexibility, and no-code automation. Trusted by Clay, Vanta, Qonto.",
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
    title:
      "The Best Gemini Enterprise Alternative for Multi-Model AI Agents",
    subtitle:
      "Deploy AI agents that work everywhere your teams do—not just inside Google's ecosystem",
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
        label: "Agent accessibility",
        dust: "Slack, Teams, Chrome, Excel, Zendesk—everywhere",
        competitor: "Custom agents trapped in separate interface",
      },
      {
        label: "Model flexibility",
        dust: "OpenAI, Anthropic, Gemini, Mistral—your choice",
        competitor: "Locked to Gemini models only",
      },
      {
        label: "Data connections",
        dust: "20+ integrations: GitHub, Notion, HubSpot, Zendesk, Snowflake",
        competitor: "Google Suite + M365 only, missing critical tools",
      },
      {
        label: "Automation",
        dust: "No-code triggers, webhooks, orchestration",
        competitor: "Python ADK required for automation",
      },
    ],
  },

  featureComparison: {
    title: "How Dust Compares to Gemini Enterprise",
    rows: [
      {
        feature: "Custom agent accessibility",
        description:
          "Call custom agents from Slack, Teams, Chrome, Excel, Zendesk",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Multi-model support",
        description: "OpenAI, Anthropic, Gemini, Mistral—switch as needed",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "No-code automation",
        description:
          "Triggers, webhooks, conditional workflows without coding",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "GitHub, Notion, HubSpot connectors",
        description: "Native integrations for developer and sales tools",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Zendesk, Snowflake, Gong connectors",
        description: "Support, data warehouse, and sales intelligence tools",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Multi-agent orchestration",
        description:
          "Parallel, sequential, conditional logic across agents",
        dust: "yes",
        competitor: "partial",
      },
      {
        feature: "Team collaboration",
        description: "Active sharing, @mentions, collaborative agent building",
        dust: "yes",
        competitor: "partial",
      },
      {
        feature: "SOC 2 Type II certified",
        description: "Enterprise-grade security and compliance",
        dust: "yes",
        competitor: "yes",
      },
      {
        feature: "Google Workspace native",
        description: "Deep integration with Gmail, Docs, Sheets, Slides",
        dust: "partial",
        competitor: "yes",
      },
      {
        feature: "Vertex AI integration",
        description: "Native Google Cloud AI platform integration",
        dust: "no",
        competitor: "yes",
      },
    ],
  },

  whyChoose: {
    title: "Why teams switch from Gemini Enterprise to Dust",
    benefits: [
      {
        icon: "rocket",
        title: "Deploy agents everywhere teams work",
        description:
          "Custom agents accessible from Slack, Teams, Chrome, Excel, Zendesk—not trapped in a separate interface. Gemini's custom agents can't be called from Gmail or Slack.",
      },
      {
        icon: "sparkles",
        title: "Never get locked into one model",
        description:
          "Choose OpenAI GPT-4, Anthropic Claude, Google Gemini, or Mistral for each task. Switch as better models launch. Gemini locks you into Google models only.",
      },
      {
        icon: "chart",
        title: "Connect your entire tech stack",
        description:
          "20+ integrations including GitHub, Notion, HubSpot, Zendesk, Snowflake, Gong. Gemini is limited to Google Suite + M365 basics—missing critical tools.",
      },
      {
        icon: "clock",
        title: "True no-code automation",
        description:
          "Build triggers, webhooks, conditional workflows, and multi-agent orchestration without coding. Gemini requires Python ADK for anything beyond basic patterns.",
      },
      {
        icon: "users",
        title: "Built for team collaboration",
        description:
          "Active sharing, @mentions, team workspaces, collaborative agent building. Gemini focuses on individual productivity with limited read-only sharing.",
      },
      {
        icon: "shield",
        title: "Proven reliability at scale",
        description:
          "2,000+ organizations trust Dust. Clay calls it \"most impactful software.\" Gemini customers report reliability issues—one Google AE admitted \"the product just doesn't work.\"",
      },
    ],
  },

  metrics: {
    title: "Why teams choose Dust",
    metrics: [
      {
        value: "20+",
        label: "Integrations",
        description: "Beyond Google ecosystem",
      },
      {
        value: "4",
        label: "AI model providers",
        description: "No vendor lock-in",
      },
      {
        value: "2,000+",
        label: "Organizations",
        description: "Trust Dust for AI agents",
      },
    ],
  },

  faq: {
    title: "Frequently Asked Questions",
    items: [
      {
        question: "Is Dust a drop-in replacement for Gemini Enterprise?",
        answer:
          "Yes. Dust provides all of Gemini Enterprise's core capabilities—AI agents, data connections, no-code builder, enterprise security—plus critical advantages: custom agents callable from Slack, Teams, Chrome, Excel; multi-model flexibility (OpenAI, Anthropic, Gemini, Mistral); true no-code automation; and broader ecosystem including GitHub, Notion, HubSpot, Zendesk, Snowflake.",
      },
      {
        question: "Can Dust agents be called from Google Workspace like Gemini?",
        answer:
          "Yes—and from everywhere else. Dust agents are accessible via Chrome extension (works in Gmail, Google Docs), Google Sheets add-on, Excel add-on, Slack bot, Microsoft Teams bot, and Zendesk extension. Gemini only allows generic Gemini in Google Workspace; custom agents are trapped in a separate platform.",
      },
      {
        question: "Does Dust support multi-agent orchestration?",
        answer:
          "Yes. Dust enables teams of specialized agents that collaborate on complex tasks with no-code conditional logic (parallel, sequential, human-in-loop). Gemini Enterprise focuses on single-purpose agents; complex orchestration requires Python coding via Vertex AI ADK.",
      },
      {
        question: "What if we're 100% Google Workspace?",
        answer:
          "Even Google-centric organizations use critical tools beyond Workspace: Salesforce, HubSpot, Gong for sales; Zendesk for support; GitHub for engineering; Snowflake for data. Dust integrates with Google Workspace while also connecting your entire tech stack and making agents accessible from Slack, Teams, and Chrome.",
      },
      {
        question: "How does Dust's pricing compare to Gemini Enterprise?",
        answer:
          "Dust offers a 14-day free trial (no credit card required). Paid plans include all 20+ integrations, unlimited custom agents, SOC 2 Type II compliance, and multi-model access with transparent per-seat pricing. Gemini Enterprise requires separate Google Cloud licensing on top of Google Workspace.",
      },
      {
        question: "What security certifications does Dust have?",
        answer:
          "Dust is SOC 2 Type II certified, GDPR compliant, and HIPAA-ready. We offer SSO/SAML, SCIM provisioning, role-based access controls, audit logs, data residency options (US/EU), and agent-level governance. Both platforms offer enterprise-grade security.",
      },
      {
        question: "Why are customers leaving Gemini Enterprise for Dust?",
        answer:
          "Customers report: reliability issues (404 errors, connectors failing), custom agents not accessible from Gmail/Slack/Teams, limited ecosystem beyond Google tools, and Python ADK required for automation. Hobbynote chose Dust as \"working product vs vaporware\" after evaluating Gemini.",
      },
      {
        question: "Can I try Dust before committing?",
        answer:
          "Yes. Start a 14-day free trial—no credit card required. You'll get full access to agent building, all 20+ data connections, multi-model access (OpenAI, Anthropic, Gemini, Mistral), and Slack/Teams/Chrome accessibility.",
      },
    ],
  },

  finalCTA: {
    title: "Ready to Deploy AI Agents Everywhere Your Teams Work?",
    subtitle:
      "Join 2,000+ organizations using Dust—without vendor lock-in or coding requirements",
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
