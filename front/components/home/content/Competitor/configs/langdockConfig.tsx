import type { CompetitorPageConfig } from "../types";

export const langdockConfig: CompetitorPageConfig = {
  competitorName: "langdock",
  competitorDisplayName: "Langdock",
  competitorLogo: "/static/landing/compare/langdock.svg",

  seo: {
    title: "Best Langdock Alternative for Enterprise AI Agents | Dust",
    description:
      "Compare Dust to Langdock. Superior semantic search, AI everywhere you work, real-time collaboration, and predictable pricing. Trusted by Clay, Vanta, Qonto. 14-day free trial.",
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
    title: "The Best Langdock Alternative for Enterprise AI Agents",
    subtitle:
      "Deploy AI agents with superior semantic search, unlimited access points, and predictable pricing—no hidden AI usage fees",
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
        label: "Semantic search",
        dust: "Industry-leading RAG with automatic indexing",
        competitor: "Basic text search through titles and content",
      },
      {
        label: "AI accessibility",
        dust: "Chrome, Sheets, Excel, Zendesk, Slack, Teams",
        competitor: "Web platform, Slack bot, Teams bot only",
      },
      {
        label: "Collaboration",
        dust: "@mentions, interactive shareable Frames",
        competitor: "Static chat sharing, PNG chart exports",
      },
      {
        label: "Pricing",
        dust: "Unlimited conversations included in base price",
        competitor: "All AI usage billed separately (+10% surcharge)",
      },
    ],
  },

  featureComparison: {
    title: "How Dust Compares to Langdock",
    rows: [
      {
        feature: "Semantic search & RAG",
        description:
          "Industry-leading RAG with automatic indexing across all sources",
        dust: "yes",
        competitor: "partial",
      },
      {
        feature: "Chrome extension",
        description: "AI accessible on any website via browser extension",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Google Sheets & Excel add-ons",
        description: "AI directly in your spreadsheets",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Zendesk sidebar",
        description: "AI agent embedded in support tickets",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Real-time collaboration",
        description: "@mention colleagues, interactive shareable Frames",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Multi-agent orchestration",
        description: "Agents collaborate in same conversation + sub-agents",
        dust: "yes",
        competitor: "partial",
      },
      {
        feature: "Deep research (unlimited)",
        description: "Internal data + web research, no monthly limits",
        dust: "yes",
        competitor: "partial",
      },
      {
        feature: "Predictable pricing",
        description: "Unlimited conversational AI in base price",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Visual workflow builder",
        description: "Drag-and-drop nodes, triggers, loops, conditionals",
        dust: "partial",
        competitor: "yes",
      },
      {
        feature: "Pre-built actions",
        description: "700+ documented actions across integrations",
        dust: "partial",
        competitor: "yes",
      },
    ],
  },

  whyChoose: {
    title: "Why teams switch from Langdock to Dust",
    benefits: [
      {
        icon: "sparkles",
        title: "Industry-leading RAG and semantic search",
        description:
          'Independent users concluded: "Dust\'s killer feature is embedded RAG-retrieval database." Find information by intent and context, not just keyword matches.',
      },
      {
        icon: "rocket",
        title: "AI accessible everywhere you work",
        description:
          "Chrome extension, Google Sheets, Excel, Zendesk sidebar, Slack, Teams, and Zapier/Make. Langdock only works in web, Slack bot, and Teams bot.",
      },
      {
        icon: "users",
        title: "Real-time collaboration and interactive content",
        description:
          "@mention colleagues into active conversations. Create interactive shareable Frames with flexible access controls. Langdock only offers static chat sharing.",
      },
      {
        icon: "dollar",
        title: "Predictable pricing—no surprise bills",
        description:
          "Unlimited conversational AI included in base price. Langdock charges separately for ALL AI conversations with 10% surcharge.",
      },
      {
        icon: "chart",
        title: "Unlimited deep research",
        description:
          "@deep-dive combines internal company data + web research with no monthly limits. Langdock limits research to 15 uses/user/month.",
      },
      {
        icon: "chat",
        title: "Multi-agent orchestration in conversations",
        description:
          "Agents collaborate in the same conversation thread with sub-agents. Langdock agents can only chain in workflows, not chat together.",
      },
    ],
  },

  metrics: {
    title: "Why teams choose Dust",
    metrics: [
      {
        value: "20+",
        label: "Integrations",
        description: "With semantic RAG indexing",
      },
      {
        value: "6+",
        label: "Access points",
        description: "Chrome, Sheets, Excel, Zendesk, Slack, Teams",
      },
      {
        value: "$29",
        label: "Per user/month",
        description: "Unlimited conversations included",
      },
    ],
  },

  faq: {
    title: "Frequently Asked Questions",
    items: [
      {
        question: "Is Dust a drop-in replacement for Langdock?",
        answer:
          "Yes. Dust provides all of Langdock's core capabilities—AI agents, data connections, no-code builder, multi-model support—plus advanced features like industry-leading semantic search, real-time collaboration, interactive Frames, and AI accessibility across Chrome, Google Sheets, Excel, and Zendesk. Most teams migrate in under a week.",
      },
      {
        question: "How does Dust's pricing compare to Langdock's?",
        answer:
          "Dust offers more predictable pricing with unlimited conversational AI included in your per-user base price. Langdock charges €20/user/month plus separate charges for ALL AI conversations with 10% surcharge. A team of 100 users could face unpredictable monthly bills that grow with every AI interaction.",
      },
      {
        question: "What about semantic search vs. Langdock's text search?",
        answer:
          "This is Dust's biggest differentiator. Langdock uses basic text search through document titles and content—you need exact keywords. Dust uses semantic RAG that understands context, intent, and meaning. Independent users concluded: \"Dust's killer feature is embedded RAG-retrieval database.\"",
      },
      {
        question: "Does Dust support visual workflow automation like Langdock?",
        answer:
          "Dust takes a conversational approach where agents chain other agents naturally, use Dust Apps for custom logic, and integrate with Zapier/Make for scheduled automation. This means anyone can create workflows using natural language. If you need Langdock's visual workflow builder (€449/month add-on), we recommend using Zapier/Make alongside Dust.",
      },
      {
        question: "Can Dust access data in real-time like Langdock?",
        answer:
          "Yes—and Dust goes further with bi-directional sync. Real-time data access from Slack, Notion, Salesforce, GitHub, Google Drive, Confluence, and 20+ sources. Plus write capabilities to update Notion docs, post Slack messages, update Salesforce records, and create GitHub issues.",
      },
      {
        question: "Does Dust have the same security certifications?",
        answer:
          "Yes. Dust is SOC 2 Type II certified, GDPR compliant, HIPAA-ready, with SSO/SAML, SCIM, role-based access controls, audit logs, and data residency options (US/EU). Both platforms meet enterprise security standards.",
      },
      {
        question: "How long does migration from Langdock take?",
        answer:
          "Most teams complete migration in 5-7 days. Day 1-2: Connect data sources. Day 3-4: Rebuild key agents using Dust's no-code builder. Day 5-6: Team training. Day 7: Full deployment. Our customer success team provides migration planning, agent rebuild assistance, and training sessions.",
      },
      {
        question: "Can I try Dust before committing?",
        answer:
          "Yes. Start a 14-day free trial—no credit card required. You'll get full access to agent building, all 20+ data connections, Chrome extension, Google Sheets add-on, Excel add-on, Zendesk sidebar, real-time collaboration, and unlimited conversational AI.",
      },
    ],
  },

  finalCTA: {
    title: "Ready to Upgrade from Langdock?",
    subtitle:
      "Get industry-leading semantic search, real-time collaboration, and predictable pricing",
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
