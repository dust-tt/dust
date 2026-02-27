import type { FAQItem } from "@app/components/home/FAQ";
import type { ReactNode } from "react";

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

export interface ChatGPTConfig {
  hero: HeroConfig;
  comparison: ComparisonConfig;
  testimonials: Testimonial[];
  differentiators: Differentiator[];
  stats: Stat[];
  faq: FAQItem[];
  cta: CTAConfig;
}

export const chatgptConfig: ChatGPTConfig = {
  hero: {
    chip: "Dust vs ChatGPT - Sales Use Case Comparison",
    headline: (
      <>
        <span className="text-gray-900">ChatGPT gives advice.</span>
        <br />
        <span className="bg-gradient-to-r from-blue-500 to-emerald-500 bg-clip-text text-transparent">
          Dust closes deals.
        </span>
      </>
    ),
    postItText:
      '"I tried updating HubSpot fields one by one after every call" – said no sales rep ever',
    valuePropTitle:
      "Why top sales teams like Watershed, Clay, and Vanta choose Dust:",
    valueProps: [
      "Automate CRM updates, follow-ups, and RFPs — no manual copy-paste",
      "50+ integrations with Salesforce, HubSpot, Slack, Notion, and more",
      "No-code setup: build powerful sales agents in minutes, not months",
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
    competitorHeader: "ChatGPT",
    features: [
      {
        name: "Actions on external sales tools",
        description:
          "Update CRM records, send follow-ups, and trigger workflows directly",
        dust: "yes",
        competitor: "partial",
      },
      {
        name: "Multi-model AI",
        description: "GPT-4, Claude, Gemini, Mistral—choose the best per task",
        dust: "yes",
        competitor: "no",
      },
      {
        name: "Transparent pricing",
        description: "$29/mo per user with no hidden fees or minimums",
        dust: "yes",
        competitor: "no",
      },
      {
        name: "50+ integrations",
        description: "Salesforce, HubSpot, Slack, Notion, GitHub, and more",
        dust: "yes",
        competitor: "yes",
      },
      {
        name: "Automated workflows",
        description:
          "Schedule agents to run automatically or trigger from external events",
        dust: "yes",
        competitor: "partial",
      },
      {
        name: "Team collaboration",
        description:
          "Share agents, knowledge bases, and workflows across your sales team",
        dust: "yes",
        competitor: "no",
      },
      {
        name: "Interactive dashboards (Frames)",
        description: "Real-time React components for sales data visualization",
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
        "Dust has transformed how our sales team operates. Our reps spend time selling, not updating spreadsheets — the AI handles the admin work automatically.",
      name: "Amance Carbero-Caux",
      title: "Employee Experience Manager at PayFit",
      logo: "/static/landing/logos/color/payfit.png",
    },
    {
      quote:
        "We cut RFP response time by 97% and our reps finally focus on deals, not documentation. Dust plugs right into our existing sales stack.",
      name: "Danny Barati",
      title: "Business Systems Lead for GTM at Vanta",
      logo: "/static/landing/logos/gray/vanta.svg",
    },
  ],

  differentiators: [
    {
      title: "Custom AI Agents",
      description:
        "Build specialized sales agents that understand your playbooks, products, and processes — and can take action, not just answer questions.",
      iconColor: "green",
      icon: "robot",
    },
    {
      title: "Workflow Automation",
      description:
        "Agents that work while you sleep. Automate CRM updates, follow-up emails, and pipeline reports — triggered by calls, meetings, or external events.",
      iconColor: "orange",
      icon: "bolt",
    },
    {
      title: "Living Knowledge Base",
      description:
        "Your sales playbooks, competitive intel, and product knowledge stay current and accessible, connected to all your data sources in real-time.",
      iconColor: "blue",
      icon: "book",
    },
    {
      title: "Team-First Design",
      description:
        "Agents designed to collaborate with your sales team, not replace them. Full transparency, human oversight, and team-wide sharing built in.",
      iconColor: "red",
      icon: "users",
    },
  ],

  stats: [
    {
      value: "97%",
      label: "time saved on RFPs",
      company: "Watershed",
      logo: "/static/landing/logos/gray/watershed.svg",
    },
    {
      value: "58 hours",
      label: "saved per month (team of 20 sales reps)",
      company: "Clay",
      logo: "/static/landing/logos/gray/clay.svg",
    },
    {
      value: "80%",
      label: "less admin time",
      company: "Pennylane",
      logo: "/static/landing/logos/gray/pennylane.svg",
    },
    {
      value: "20%+",
      label: "productivity gains in sales operations",
      company: "Vanta",
      logo: "/static/landing/logos/gray/vanta.svg",
    },
  ],

  faq: [
    {
      question: "How is Dust different from ChatGPT for sales teams?",
      answer: (
        <>
          <p>
            ChatGPT is a great conversational AI, but it can't take action in
            your sales tools. Dust is built around AI agents that actually
            execute tasks in your stack. With Dust, your sales team gets AI
            teammates that can:
          </p>
          <ul>
            <li>Update CRM records and pipeline stages automatically</li>
            <li>Draft and send follow-up emails after every call</li>
            <li>Generate RFP responses from your knowledge base</li>
            <li>
              Collaborate across Slack, Salesforce, HubSpot, and 50+ tools
            </li>
          </ul>
        </>
      ),
    },
    {
      question: "Can Dust integrate with my existing CRM?",
      answer: (
        <>
          <p>
            Yes. Dust connects directly with Salesforce, HubSpot, and other
            leading CRMs. Your agents can read pipeline data, update fields,
            create tasks, and trigger workflows — without reps having to do it
            manually. We also support Slack, Notion, Google Drive, GitHub, and
            50+ other tools out of the box.
          </p>
        </>
      ),
    },
    {
      question: "What does a sales agent in Dust actually do?",
      answer: (
        <>
          <p>
            A Dust sales agent is a specialized AI teammate configured for your
            specific workflows. Examples include:
          </p>
          <ul>
            <li>
              <strong>Call summarizer:</strong> Automatically updates CRM with
              meeting notes and next steps
            </li>
            <li>
              <strong>RFP responder:</strong> Generates proposal drafts from
              your knowledge base in minutes
            </li>
            <li>
              <strong>Pipeline analyst:</strong> Surfaces at-risk deals and
              coaching insights from your data
            </li>
            <li>
              <strong>Onboarding assistant:</strong> Ramps new reps faster with
              instant answers on products and processes
            </li>
          </ul>
        </>
      ),
    },
    {
      question: "How quickly can we get started?",
      answer: (
        <>
          <p>
            Most sales teams are up and running within minutes. Our no-code
            builder means you can create your first custom agent without any
            technical expertise. Connect your data sources, configure your
            agent's instructions, and you're ready to go. For enterprise
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

  cta: {
    title: "Start building AI teammates for your Sales team",
    subtitle:
      "Join 500+ companies using Dust to transform their sales operations",
    buttonText: "Start Free Trial",
    trustBadges: [
      "No credit card required",
      "Set up in 5 minutes",
      "SOC 2 Type II certified",
    ],
  },
};
