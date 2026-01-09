import type { CompetitorPageConfig } from "../types";

export const chatgptConfig: CompetitorPageConfig = {
  competitorName: "chatgpt",
  competitorDisplayName: "ChatGPT Enterprise",
  competitorLogo: "/static/landing/compare/chatgpt.svg",

  seo: {
    title: "Best ChatGPT Enterprise Alternative for AI Agents at Work | Dust",
    description:
      "Compare Dust to ChatGPT Enterprise. Multi-model platform with agent orchestration, 200+ actions, SOC 2 security, and true collaboration. Trusted by Clay, Vanta, Qonto.",
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
      "The Best ChatGPT Enterprise Alternative for Teams That Need AI Agents Everywhere",
    subtitle:
      "Deploy AI agents that orchestrate workflows, take actions, and collaborate—across Slack, your CRM, support tools, and everywhere your team works",
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
        label: "Agent deployment",
        dust: "Slack, Teams, Chrome, Zendesk, Google Workspace",
        competitor: "Custom GPTs only in ChatGPT app",
      },
      {
        label: "Actions on tools",
        dust: "200+ write actions via MCP, no-code",
        competitor: "Read-only; write actions require coding",
      },
      {
        label: "Model access",
        dust: "OpenAI, Anthropic, Gemini, Mistral",
        competitor: "OpenAI only, rate limits on new models",
      },
      {
        label: "Collaboration",
        dust: "Multi-agent orchestration, @mentions, sharing",
        competitor: "Single-owner GPTs, no @mentions",
      },
    ],
  },

  featureComparison: {
    title: "How Dust Compares to ChatGPT Enterprise",
    rows: [
      {
        feature: "Deploy agents everywhere",
        description:
          "Agents accessible in Slack, Teams, Chrome, Zendesk, Google Workspace",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Write actions on tools",
        description:
          "Update Salesforce, create Zendesk tickets, push to GitHub, post to Slack",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Multi-model support",
        description: "OpenAI, Anthropic, Gemini, Mistral—choose per task",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Multi-agent orchestration",
        description:
          "Sequential, parallel, conditional logic across specialized agents",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Team collaboration",
        description: "@mention teammates and agents, share conversations",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Webhook triggers",
        description: "Native webhooks + scheduling for automation",
        dust: "yes",
        competitor: "partial",
      },
      {
        feature: "Custom integrations (MCP)",
        description: "Add any API connector quickly, low-code",
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
        feature: "Mobile app",
        description: "Native iOS/Android apps",
        dust: "no",
        competitor: "yes",
      },
      {
        feature: "Video generation",
        description: "Sora integration for brand/marketing",
        dust: "no",
        competitor: "yes",
      },
    ],
  },

  whyChoose: {
    title: "Why teams switch from ChatGPT Enterprise to Dust",
    benefits: [
      {
        icon: "rocket",
        title: "Agents work everywhere—not just in a chatbot",
        description:
          "Your custom agents are accessible in Slack channels, Microsoft Teams, Chrome extension, Zendesk tickets, Google Sheets—wherever your work happens.",
      },
      {
        icon: "sparkles",
        title: "Agents do—not just read",
        description:
          "200+ actions via MCP: update CRM records, create support tickets, push code, schedule meetings, post Slack messages, edit Notion docs—all no-code.",
      },
      {
        icon: "chart",
        title: "Multi-model flexibility—no vendor lock-in",
        description:
          "Switch between OpenAI GPT-4o, Anthropic Claude, Google Gemini, Mistral—choose the best model for each task, never get locked into one vendor.",
      },
      {
        icon: "users",
        title: "Built for team collaboration",
        description:
          "Agents collaborate with other agents. @mention teammates in conversations. Share interactive Frames with stakeholders. Multi-editor workflows with version control.",
      },
      {
        icon: "clock",
        title: "No rate limits on key features",
        description:
          "ChatGPT Enterprise limits deep research to 25/month and agent mode to 40/month per user. Dust has no per-feature rate limits—usage scales with your team.",
      },
      {
        icon: "chat",
        title: "EU data residency available",
        description:
          "ChatGPT Enterprise synced connectors are US-only. Dust offers data residency options (US/EU) with all integrations available.",
      },
    ],
  },

  metrics: {
    title: "Why teams choose Dust",
    metrics: [
      {
        value: "200+",
        label: "Write actions",
        description: "Via MCP servers",
      },
      {
        value: "4",
        label: "AI model providers",
        description: "OpenAI, Anthropic, Gemini, Mistral",
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
        question: "Is Dust a drop-in replacement for ChatGPT Enterprise?",
        answer:
          "Yes. Dust provides all ChatGPT Enterprise's core capabilities (AI agents, data connections, no-code builder) plus advanced orchestration, deeper integrations, and multi-model flexibility. Most teams migrate in under a week with onboarding support.",
      },
      {
        question:
          "Can ChatGPT Enterprise custom GPTs be called from Slack or Teams?",
        answer:
          "No. Custom GPTs are only accessible inside the ChatGPT web/desktop/mobile app. They cannot be called from Slack, Teams, Gmail, Zendesk, or any external tool. Dust agents work in all these environments natively.",
      },
      {
        question:
          "Does ChatGPT Enterprise support write actions on tools like Salesforce?",
        answer:
          "No—most MCP connectors are read-only. Writing to Salesforce, Zendesk, GitHub, HubSpot, Notion, Gmail, or Slack requires custom coding. Dust provides 200+ write actions via MCP servers, no coding required.",
      },
      {
        question:
          "Do ChatGPT Enterprise customers get new models at the same time as Plus/Pro users?",
        answer:
          "No. Enterprise customers often receive new models after Plus and Pro users. Additionally, Enterprise has rate limits (25 deep research requests/month, 40 agent mode requests/month). Dust provides immediate access to all models across OpenAI, Anthropic, Gemini, and Mistral.",
      },
      {
        question:
          "What are the monthly limits for Deep Research and Agent Mode in ChatGPT Enterprise?",
        answer:
          "25 requests/month for Deep Research, 40 requests/month for Agent Mode per user. For teams running scaled workflows, these limits can be restrictive. Dust has no per-feature rate limits.",
      },
      {
        question:
          "Can EU customers use ChatGPT Enterprise's synced connectors?",
        answer:
          "No—synced connectors for Google Drive and SharePoint are US-only. EU customers with data residency requirements lose access to synced connectors. Dust offers data residency options (US/EU) with all integrations available.",
      },
      {
        question: "How does pricing compare?",
        answer:
          "Dust offers a 14-day free trial (no credit card required). Paid plans start with transparent per-seat pricing and include all integrations, unlimited agents, and SOC 2 compliance. Enterprise plans add custom data residency, dedicated support, and SLAs.",
      },
      {
        question: "Can I try Dust before committing?",
        answer:
          "Yes. Start a 14-day free trial—no credit card required. You'll get full access to agent building, data connections, orchestration, and collaboration features.",
      },
    ],
  },

  finalCTA: {
    title: "Ready to Move Beyond ChatGPT Enterprise's Limitations?",
    subtitle:
      "Start deploying AI agents that work everywhere your team does—not just in a chatbot",
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
