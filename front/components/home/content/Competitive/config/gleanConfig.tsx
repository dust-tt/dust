import type { ReactNode } from "react";

import type { FAQItem } from "@app/components/home/FAQ";

interface HeroConfig {
  chip: string;
  headline: ReactNode;
  postItText: string;
  valuePropTitle: string;
  valueProps: string[];
  ctaButtonText: string;
  trustBadges: string[];
}

interface ComparisonFeature {
  name: string;
  description?: string;
  dust: "yes" | "no" | "partial";
  competitor: "yes" | "no" | "partial";
}

interface ComparisonConfig {
  dustHeader: string;
  competitorHeader: string;
  features: ComparisonFeature[];
}

interface Testimonial {
  quote: string;
  name: string;
  title: string;
  logo: string;
}

interface Differentiator {
  title: string;
  description: string;
  iconColor: "green" | "orange" | "blue" | "red";
  icon: "robot" | "bolt" | "book" | "users";
}

interface Stat {
  value: string;
  label: string;
  company: string;
  logo: string;
}

interface CTAConfig {
  title: string;
  subtitle: string;
  buttonText: string;
  trustBadges: string[];
}

export interface GleanConfig {
  hero: HeroConfig;
  comparison: ComparisonConfig;
  testimonials: Testimonial[];
  differentiators: Differentiator[];
  stats: Stat[];
  faq: FAQItem[];
  cta: CTAConfig;
}

export const gleanConfig: GleanConfig = {
  hero: {
    chip: "Dust vs Glean Comparison",
    headline: (
      <>
        <span className="text-gray-900">Glean finds answers.</span>
        <br />
        <span className="bg-gradient-to-r from-blue-500 to-emerald-500 bg-clip-text text-transparent">
          Dust builds teammates.
        </span>
      </>
    ),
    postItText:
      '"AI Search is so 2018, let\'s actually get deliverables from AI"',
    valuePropTitle:
      "Why fast-growing teams like Clay, Vanta, and WhatNot choose Dust:",
    valueProps: [
      "Build AI agents that actually do work, not just answer questions",
      "Agent-first, not search-first: AI that does work, not just finds",
      "No code required, build powerful AI teammates in minutes, not months",
    ],
    ctaButtonText: "Start Free Trial",
    trustBadges: [
      "No credit card required",
      "Set up in minutes",
      "SOC 2 Type II certified",
    ],
  },

  comparison: {
    dustHeader: "DUST",
    competitorHeader: "glean",
    features: [
      {
        name: "Agent-first architecture",
        description: "Built from day one for agentic automation, not search",
        dust: "yes",
        competitor: "no",
      },
      {
        name: "No-code agent builder",
        description: "Create agents in 5 minutes without technical knowledge",
        dust: "yes",
        competitor: "no",
      },
      {
        name: "Multi-agent orchestration",
        description: "Flexible sub-agents for complex cross-domain workflows",
        dust: "yes",
        competitor: "no",
      },
      {
        name: "20+ AI models",
        description: "GPT-4, Claude, Gemini, Mistral—choose per task",
        dust: "yes",
        competitor: "partial",
      },
      {
        name: "Transparent pricing",
        description: "$29/mo per user with no hidden fees or minimums",
        dust: "yes",
        competitor: "no",
      },
      {
        name: "50+ integrations",
        description: "Slack, Notion, Salesforce, GitHub, and more",
        dust: "yes",
        competitor: "yes",
      },
      {
        name: "Out-of-the-box vertical agents",
        description:
          "Ready-to-use agents for onboarding, writing SDRs, and more",
        dust: "yes",
        competitor: "no",
      },
      {
        name: "Interactive dashboards (Frames)",
        description: "Real-time React components for data visualization",
        dust: "yes",
        competitor: "no",
      },
      {
        name: "SOC 2 Type II certified",
        description: "Enterprise-grade security and compliance",
        dust: "yes",
        competitor: "yes",
      },
    ],
  },

  testimonials: [
    {
      quote:
        "Dust is the most impactful software we've adopted since building Clay. It delivers immediate value while continuously getting smarter and more valuable over time.",
      name: "Everett Berry",
      title: "Head of GTM Engineering at Clay",
      logo: "/static/landing/logos/color/clay.png",
    },
    {
      quote:
        "We asked ourselves for years: what if your team had 20% more time? Dust has made it possible, empowering our employees to work smarter, innovate, and push boundaries.",
      name: "Matthieu Birach",
      title: "Chief People Officer at Doctolib",
      logo: "/static/landing/logos/color/doctolib.png",
    },
    {
      quote:
        "It became evident that Dust could serve as a knowledgeable buddy for all staff, enhancing productivity whether you're newly onboarded or a veteran team member.",
      name: "Boris Lipiainen",
      title: "Chief Product and Technology Officer at Kyriba",
      logo: "/static/landing/logos/color/kyriba.png",
    },
  ],

  differentiators: [
    {
      title: "Custom AI Agents",
      description:
        "Build specialized agents that understand your business processes and can take action, not just answer questions.",
      iconColor: "green",
      icon: "robot",
    },
    {
      title: "Workflow Automation",
      description:
        "Create multi-step workflows that combine human expertise with AI capabilities to handle complex tasks.",
      iconColor: "orange",
      icon: "bolt",
    },
    {
      title: "Living Knowledge Base",
      description:
        "Your company knowledge stays current and accessible, connected to all your data sources in real-time.",
      iconColor: "blue",
      icon: "book",
    },
    {
      title: "Team-First Design",
      description:
        "Agents designed to collaborate with your team, not replace them. Full transparency and human oversight.",
      iconColor: "red",
      icon: "users",
    },
  ],

  stats: [
    {
      value: "73%",
      label: "faster response times",
      company: "Vanta",
      logo: "/static/landing/logos/gray/vanta.svg",
    },
    {
      value: "5x",
      label: "more tickets resolved",
      company: "Pennylane",
      logo: "/static/landing/logos/gray/pennylane.svg",
    },
    {
      value: "40%",
      label: "time saved per week",
      company: "Qonto",
      logo: "/static/landing/logos/gray/qonto.svg",
    },
    {
      value: "10x",
      label: "agent adoption rate",
      company: "Clay",
      logo: "/static/landing/logos/gray/clay.svg",
    },
  ],

  faq: [
    {
      question: "How is Dust different from Glean?",
      answer: (
        <>
          <p>
            While Glean focuses primarily on enterprise search and finding
            information, Dust is built around AI agents that can actually
            execute tasks. With Dust, you're not just getting answers—you're
            getting AI teammates that can:
          </p>
          <ul>
            <li>Take multi-step actions across your tools</li>
            <li>Automate complex workflows without code</li>
            <li>Collaborate with multiple specialized agents</li>
            <li>Learn and improve from your team's feedback</li>
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
              company's documentation and data
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
            expertise. Connect your data sources, configure your agent's
            instructions, and you're ready to go. For enterprise deployments, we
            offer dedicated onboarding support.
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

  cta: {
    title: "Ready to build your AI team?",
    subtitle:
      "Join the teams who switched from search tools to AI agents that actually get work done.",
    buttonText: "Get Started",
    trustBadges: ["14-day free trial", "No credit card required", "SOC 2"],
  },
};
