import type { CompetitorPageConfig } from "../types";

export const notionConfig: CompetitorPageConfig = {
  competitorName: "notion",
  competitorDisplayName: "Notion AI",
  competitorLogo: "/static/landing/compare/notion.svg",

  seo: {
    title: "Best Notion AI Alternative for Enterprise Teams | Dust",
    description:
      "Compare Dust to Notion AI. Cross-platform AI agents with write actions, data warehouse queries, multi-agent orchestration, and 20+ integrations. From $29/user.",
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
    title: "The Best Notion AI Alternative for Cross-Platform AI Agents",
    subtitle:
      "AI agents that work across your entire stack—not just inside Notion",
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
        label: "Cross-platform actions",
        dust: "Write to Salesforce, GitHub, Slack, Zendesk",
        competitor: "Actions confined to Notion workspace only",
      },
      {
        label: "Data analysis",
        dust: "Query Snowflake/BigQuery, unlimited rows",
        competitor: "1,000-row CSV limit, no data warehouses",
      },
      {
        label: "Accessibility",
        dust: "Slack, Chrome, Zendesk, Sheets, API",
        competitor: "Notion app only",
      },
      {
        label: "Multi-agent",
        dust: "Orchestrator calls specialized agents",
        competitor: "One workspace-level agent",
      },
    ],
  },

  featureComparison: {
    title: "How Dust Compares to Notion AI",
    rows: [
      {
        feature: "Cross-platform actions",
        description:
          "Write to Salesforce, GitHub, Slack, Zendesk, HubSpot, and more",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Data warehouse queries",
        description:
          "Query Snowflake/BigQuery with natural language, unlimited rows",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Multi-agent orchestration",
        description:
          "Orchestrator calls specialized agents (Sales, Finance, Support)",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Scheduled triggers",
        description: "Autonomous execution: daily queries, automated workflows",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Multi-surface accessibility",
        description: "Slack, Teams, Chrome, Zendesk, Sheets, CLI, API",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Collaborative AI threads",
        description: "@mention colleagues, share conversations",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Model choice",
        description: "Choose OpenAI, Anthropic, Gemini, Mistral per task",
        dust: "yes",
        competitor: "partial",
      },
      {
        feature: "20+ integrations",
        description:
          "HubSpot, Salesforce, Snowflake, BigQuery, Confluence, Intercom, Gong",
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
        feature: "Native Notion integration",
        description: "Deep integration with Notion workspace",
        dust: "partial",
        competitor: "yes",
      },
    ],
  },

  whyChoose: {
    title: "Why teams switch from Notion AI to Dust",
    benefits: [
      {
        icon: "rocket",
        title: "Work where your team works",
        description:
          "Deploy AI agents in Slack, Chrome, Zendesk, Google Sheets, API. Notion AI requires switching to the Notion app for every interaction.",
      },
      {
        icon: "sparkles",
        title: "Write to external systems",
        description:
          "Update Salesforce records, create GitHub issues, post to Slack, modify Zendesk tickets. Notion AI actions stay within Notion.",
      },
      {
        icon: "chart",
        title: "Analyze real business data at scale",
        description:
          "Query Snowflake/BigQuery with natural language, no row limits. Notion AI caps CSV analysis at 1,000 rows.",
      },
      {
        icon: "users",
        title: "Orchestrate specialized agents",
        description:
          "One conversation triggers multiple specialized agents (Sales, Finance, Support). Notion AI has one workspace-level agent.",
      },
      {
        icon: "clock",
        title: "Automate with scheduled triggers",
        description:
          '"Query Salesforce daily at 8 AM and post results to Slack." Notion AI requires manual prompting every time.',
      },
      {
        icon: "chat",
        title: "Collaborate on AI conversations",
        description:
          "@mention colleagues, share threads, create dedicated human-agent channels. Notion AI conversations are single-user.",
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
        description: "vs. $20 Notion AI add-on",
      },
    ],
  },

  faq: {
    title: "Frequently Asked Questions",
    items: [
      {
        question: "Is Dust a drop-in replacement for Notion AI?",
        answer:
          "Yes. Dust provides all Notion AI's core capabilities (semantic search, document writing, knowledge retrieval) plus cross-platform actions, data warehouse queries, and multi-agent orchestration. Most teams migrate in under a week with onboarding support.",
      },
      {
        question: "Can Notion AI write to Salesforce, GitHub, or Slack?",
        answer:
          "No. Notion AI actions are confined to the Notion workspace (create/edit pages, databases). To update Salesforce or post to Slack, you'd need to set up database automations + Zapier. Dust agents write directly to external systems via MCP protocol.",
      },
      {
        question: "Can Notion AI query Snowflake or BigQuery?",
        answer:
          'No. Notion AI has no data warehouse connectors and caps CSV analysis at 1,000 rows. Its documentation states it\'s "not meant for complex calculations or data analysis." Dust has native SQL connectors—teams ask questions in natural language, and we translate to SQL.',
      },
      {
        question: "Can you access Notion AI from Slack or Chrome?",
        answer:
          "No. Notion AI works only inside the Notion app (web/desktop/mobile). Dust agents are accessible via Slack (@mention), Chrome extension, Zendesk, Google Sheets, CLI, and API.",
      },
      {
        question: "Does Notion AI support multi-agent workflows?",
        answer:
          "No. Notion AI has one workspace-level agent. Custom Agents were announced in September 2025 but when they launch, they'll still work independently with no orchestration. Dust enables teams of specialized agents that collaborate on complex tasks.",
      },
      {
        question: "Can Notion AI run scheduled automations?",
        answer:
          'No. Notion AI must be manually prompted every time. Database automations can send webhooks, but they don\'t invoke AI reasoning. Dust supports scheduled triggers: "Query Salesforce daily at 8 AM and post results to Slack."',
      },
      {
        question: "How does pricing compare?",
        answer:
          "Notion AI: $20/user/month (add-on to Notion license), includes meeting transcripts. Dust: From $29/user/month, includes all integrations, unlimited agents, SOC 2 compliance.",
      },
      {
        question: "What security certifications does Dust have?",
        answer:
          "SOC 2 Type II certified, GDPR compliant, HIPAA-ready. We offer SSO/SAML, SCIM provisioning, role-based access controls, audit logs, and optional data residency (US/EU).",
      },
      {
        question: "Can I try Dust before committing?",
        answer:
          "Yes. Start a 14-day free trial—no credit card required. Full access to agent building, data connections, and collaboration features.",
      },
    ],
  },

  finalCTA: {
    title: "Ready to Upgrade from Notion AI?",
    subtitle:
      "See why 2,000+ organizations choose cross-platform AI agents over Notion-only AI",
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
