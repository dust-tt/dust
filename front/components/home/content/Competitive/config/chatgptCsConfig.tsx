import type { CompetitiveLandingConfig } from "@app/components/home/content/Competitive/types";

export const chatgptCsConfig: CompetitiveLandingConfig = {
  hero: {
    chip: "Dust vs ChatGPT for Customer Support",
    headline: (
      <>
        <span className="text-gray-900">ChatGPT gives advice.</span>
        <br />
        <span className="bg-gradient-to-r from-blue-500 to-emerald-500 bg-clip-text text-transparent">
          Dust closes tickets.
        </span>
      </>
    ),
    postItText: (
      <>
        &ldquo;Copy-pasting ChatGPT responses into Zendesk is a great
        workflow&rdquo; &mdash; <strong>said no CS team ever</strong>
      </>
    ),
    valuePropTitle: "Why CS teams at Vanta, Pennylane, and Qonto choose Dust:",
    valueProps: [
      "Build CS agents that resolve tickets end-to-end, not just suggest answers",
      "Connect to Zendesk, Intercom, Slack and your full knowledge base",
      "Deploy in minutes, no engineering team required",
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
    competitorHeader: "ChatGPT Enterprise",
    features: [
      {
        name: "Custom CS agent builder",
        description: "Build agents tailored to your support workflows",
        dust: "yes",
        competitor: "no",
      },
      {
        name: "Workflow automation (no code)",
        description: "Automate ticket routing, escalations, and follow-ups",
        dust: "yes",
        competitor: "no",
      },
      {
        name: "Knowledge base integration",
        description: "Connect your docs, policies, and past tickets",
        dust: "yes",
        competitor: "partial",
      },
      {
        name: "Zendesk / Intercom / Slack integration",
        description: "Native connections to your CS stack",
        dust: "yes",
        competitor: "no",
      },
      {
        name: "Multi-model support",
        description: "GPT-4, Claude, Gemini, Mistral—choose per task",
        dust: "yes",
        competitor: "partial",
      },
      {
        name: "Out-of-the-box CS agents",
        description: "Ready-to-use agents for common support workflows",
        dust: "yes",
        competitor: "no",
      },
      {
        name: "Team collaboration & sharing",
        description: "Share agents and knowledge across your CS org",
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
        "Dust is like an additional colleague who is always available and who will always provide an answer.",
      name: "Eléonore Motte",
      title: "Head of Customer Care at Pennylane",
      logo: "/static/landing/logos/color/pennylane.png",
    },
    {
      quote:
        "Dust has revolutionized our CX operations by transforming much of our manual processes into intelligent, automated workflows.",
      name: "Panagiotis Parisis",
      title: "Senior Director of Customer Experience at Blueground",
      logo: "/static/landing/logos/color/blueground.png",
    },
    {
      quote:
        "We're managing a higher volume of tickets and have cut processing time—from an average of 6 minutes per ticket to just a few seconds.",
      name: "Anaïs Ghelfi",
      title: "Head of Data Platform at Malt",
      logo: "/static/landing/logos/color/malt.png",
    },
  ],

  differentiators: [
    {
      title: "Custom CS Agents",
      description:
        "Build agents that handle tickets end-to-end—from triage to resolution—without engineering resources.",
      iconColor: "green",
      icon: "robot",
    },
    {
      title: "Full Knowledge Base Access",
      description:
        "Agents connected to your docs, policies, and past tickets so every response is accurate and consistent.",
      iconColor: "blue",
      icon: "book",
    },
    {
      title: "Automated Workflows",
      description:
        "Trigger agents on new tickets, escalations, or custom events. Your support process runs itself.",
      iconColor: "orange",
      icon: "bolt",
    },
    {
      title: "Team-First Design",
      description:
        "Built for your whole CS org, not just power users. Share agents, collaborate on knowledge, and scale together.",
      iconColor: "red",
      icon: "users",
    },
  ],

  stats: [
    {
      value: "5x",
      label: "more tickets resolved",
      company: "Pennylane",
      logo: "/static/landing/logos/gray/pennylane.svg",
    },
    {
      value: "73%",
      label: "faster response times",
      company: "Vanta",
      logo: "/static/landing/logos/gray/vanta.svg",
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
      question: "How is Dust different from ChatGPT for customer support?",
      answer: (
        <>
          <p>
            While ChatGPT can answer questions, Dust is built around AI agents
            that actually resolve tickets. With Dust, your CS team gets:
          </p>
          <ul>
            <li>Agents that take multi-step actions across your tools</li>
            <li>
              Direct integrations with Zendesk, Intercom, Slack, and your
              knowledge base
            </li>
            <li>Automated workflows triggered by new tickets or escalations</li>
            <li>
              A no-code builder your team can use without engineering help
            </li>
          </ul>
        </>
      ),
    },
    {
      question:
        "Can Dust integrate with our existing support tools like Zendesk or Intercom?",
      answer: (
        <>
          <p>
            Yes. Dust connects natively to Zendesk, Intercom, Slack, and dozens
            of other tools your CS team already uses. Agents can read ticket
            context, pull from your knowledge base, and post updates—all without
            switching tabs.
          </p>
        </>
      ),
    },
    {
      question: "What makes Dust's CS agents different from a chatbot?",
      answer: (
        <>
          <p>
            Traditional chatbots can only answer questions. Dust CS agents are
            fundamentally different:
          </p>
          <ul>
            <li>
              <strong>End-to-end resolution:</strong> They can triage, research,
              draft, and close tickets
            </li>
            <li>
              <strong>Tool integration:</strong> Direct connections to Zendesk,
              Intercom, Slack, and your docs
            </li>
            <li>
              <strong>Knowledge base access:</strong> Real-time access to your
              policies, FAQs, and past tickets
            </li>
            <li>
              <strong>Workflow automation:</strong> Trigger actions based on
              ticket content, priority, or status
            </li>
          </ul>
        </>
      ),
    },
    {
      question: "How quickly can our CS team get started with Dust?",
      answer: (
        <>
          <p>
            Most teams are up and running within minutes. Connect your knowledge
            base, configure your agent's instructions, and you're ready to
            handle tickets. No engineering team required. For larger
            deployments, we offer dedicated onboarding support.
          </p>
        </>
      ),
    },
    {
      question: "Is Dust secure for enterprise CS use?",
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
    title: "Ready to transform your support team?",
    subtitle:
      "Join the teams who moved beyond chatbots to AI agents that actually resolve tickets.",
    buttonText: "Get Started",
    trustBadges: ["14-day free trial", "No credit card required", "SOC 2"],
  },
};
