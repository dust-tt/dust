import type { CompetitorPageConfig } from "../types";

export const n8nConfig: CompetitorPageConfig = {
  competitorName: "n8n",
  competitorDisplayName: "n8n",
  competitorLogo: "/static/landing/compare/n8n.svg",

  seo: {
    title: "Best n8n Alternative for Enterprise AI Agents | Dust",
    description:
      "Compare Dust to n8n. Enterprise AI agents anyone can build—no DevOps required. Native semantic search, 50+ integrations, SOC 2 security, distributed everywhere teams work. Trusted by Clay, Vanta, Qonto.",
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
    title: "The Best n8n Alternative for Enterprise AI Agents",
    subtitle:
      "AI agents anyone can build, everywhere your team works—no DevOps required",
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
        label: "Who can build",
        dust: "Anyone—no-code agent creation in minutes",
        competitor: "DevOps/engineers only—technical expertise required",
      },
      {
        label: "Agent distribution",
        dust: "Slack, Teams, Chrome, Excel, Zendesk natively",
        competitor: "No distribution layer—API/webhooks only",
      },
      {
        label: "Semantic search",
        dust: "Native RAG across all connectors",
        competitor: "Just pipes data—no semantic search",
      },
      {
        label: "Maintenance",
        dust: "Adaptive agents evolve automatically",
        competitor: "Workflows break when APIs change",
      },
    ],
  },

  featureComparison: {
    title: "How Dust Compares to n8n",
    rows: [
      {
        feature: "No-code agent creation",
        description: "Anyone can build agents in minutes with natural language",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Native distribution",
        description:
          "Agents accessible in Slack, Teams, Chrome, Excel, Zendesk",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Semantic search (RAG)",
        description:
          "Intelligent search across Drive, Notion, Confluence, Slack, Salesforce",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Permission-aware access",
        description:
          "Built on a comprehensive permissions model for agent-specific access",
        dust: "yes",
        competitor: "partial",
      },
      {
        feature: "Human-AI collaboration",
        description: "@mention colleagues, share interactive Frames and Slides",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Deep research agent",
        description: "Multi-source research and synthesis built-in",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "Adaptive agents",
        description: "Zero reconfiguration when processes/APIs change",
        dust: "yes",
        competitor: "no",
      },
      {
        feature: "SOC 2 Type II certified",
        description: "Enterprise-grade security out of the box",
        dust: "yes",
        competitor: "partial",
      },
      {
        feature: "500+ integrations",
        description: "Large connector library for system-to-system automation",
        dust: "no",
        competitor: "yes",
      },
      {
        feature: "Self-hosting option",
        description: "Deploy on your own infrastructure",
        dust: "no",
        competitor: "yes",
      },
    ],
  },

  whyChoose: {
    title: "Why teams choose Dust over n8n",
    benefits: [
      {
        icon: "users",
        title: "Enterprise-wide adoption, not just DevOps",
        description:
          "No-code agent creation in natural language—anyone can build in minutes. Sales, marketing, support, HR, legal—every team creates value. Persona achieved 80% AI agent adoption company-wide.",
      },
      {
        icon: "rocket",
        title: "Agents live where your team works",
        description:
          "Native distribution in Slack, Microsoft Teams, Chrome extension, Excel/Sheets add-ons, Zendesk. n8n workflows run as backend processes with no way to reach end-users.",
      },
      {
        icon: "sparkles",
        title: "Semantic search unlocks agent intelligence",
        description:
          "Native semantic search indexes Drive, Notion, Confluence, Slack, Salesforce, GitHub, Gong simultaneously. n8n just pipes data between systems—no search capability.",
      },
      {
        icon: "clock",
        title: "Adaptive agents > high-maintenance workflows",
        description:
          "Agents adapt naturally when processes or APIs change—no reconfiguration needed. n8n workflows are brittle and require constant DevOps maintenance.",
      },
      {
        icon: "shield",
        title: "Permission-aware access, not shared credentials",
        description:
          "Automatically inherits user permissions from source systems. n8n uses shared credentials—a junior employee triggering a workflow gets the same access as a senior employee.",
      },
      {
        icon: "dollar",
        title: "True total cost of ownership",
        description:
          "All-in per-user pricing includes models, infrastructure, security, compliance. n8n's 'free' license requires infrastructure + DevOps salaries + OpenAI API costs + maintenance.",
      },
    ],
  },

  metrics: {
    title: "Why teams choose Dust",
    metrics: [
      {
        value: "80%",
        label: "Company-wide adoption",
        description: "Persona's AI agent usage",
      },
      {
        value: "70%",
        label: "Weekly active users",
        description: "Patch team using agents",
      },
      {
        value: "50+",
        label: "Integrations",
        description: "With semantic search",
      },
    ],
  },

  faq: {
    title: "Frequently Asked Questions",
    items: [
      {
        question: "Is Dust a drop-in replacement for n8n?",
        answer:
          "It depends on your use case. If you're using n8n for backend deterministic workflows (ETL, data pipelines), keep n8n—that's its strength. If you're building intelligent agents for your team to use, Dust is purpose-built for that and dramatically simpler. Many teams use both: n8n for backend automation, Dust for user-facing agents.",
      },
      {
        question: "How does Dust's pricing compare to n8n?",
        answer:
          "n8n has a 'free' license but requires infrastructure costs ($500-$2,000+/month), DevOps salaries ($150K+ annually), and separate OpenAI/Anthropic API costs. Dust offers all-in per-user pricing that includes models, infrastructure, security (SOC 2 Type II), and compliance. When you factor total cost of ownership, Dust is often more cost-effective.",
      },
      {
        question: "n8n has 500+ integrations. Dust has ~50. Why choose Dust?",
        answer:
          "Dust covers 90% of critical enterprise tools. The real differentiator: Dust indexes data for semantic search across all connectors. n8n just pipes data between systems. For agents, 50 connectors with intelligent search beats 500 without it.",
      },
      {
        question: "We can build agents in n8n. Why use Dust?",
        answer:
          "You'll hit limitations fast: no distribution layer (can't reach Slack/Teams/Chrome), no semantic search (need to build RAG pipelines manually), shared credentials (compliance risk), only engineers can maintain it, and workflows break when APIs change. n8n is an automation tool for DevOps. Dust is an agent platform for enterprises.",
      },
      {
        question: "What security certifications does Dust have?",
        answer:
          "Dust is SOC 2 Type II certified, GDPR compliant, and HIPAA-ready. We offer SSO/SAML, SCIM provisioning, role-based access controls, audit logs, and optional data residency (US/EU). With n8n self-hosting, you own all security and compliance management—a full-time job.",
      },
      {
        question: "We need self-hosting for compliance. Can Dust do that?",
        answer:
          "Dust offers data residency options (US/EU) within our SOC 2 Type II-certified cloud infrastructure. For most organizations, this is more secure than self-hosting because you avoid maintaining SOC 2/GDPR compliance yourself. For highly regulated industries, contact us about dedicated deployment options.",
      },
      {
        question: "Can I try Dust before committing?",
        answer:
          "Yes. Start a 14-day free trial—no credit card required. You'll get full access to no-code agent creation, all 50+ enterprise connectors, semantic search, and distribution in Slack, Teams, Chrome, and Excel.",
      },
    ],
  },

  finalCTA: {
    title: "Ready to Democratize AI Across Your Organization?",
    subtitle:
      "n8n automates backend processes for technical teams. Dust augments everyone.",
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
