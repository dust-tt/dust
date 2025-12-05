import { ActionBankIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import { createLayoutConfig } from "@app/components/home/content/Industry/configs/utils";

export const financialServicesConfig: IndustryPageConfig = {
  seo: {
    title: "Dust for Financial Services",
    description:
      "AI agents for compliance, support, and growth. Transform financial operations with intelligent automation while maintaining the highest security and regulatory standards.",
  },
  layout: createLayoutConfig([
    "hero",
    "aiAgents",
    "trustedBy",
    "painPoints",
    "dustInAction",
    "impactMetrics",
    "demoVideo",
    "testimonial",
    "customerStories",
    "justUseDust",
  ]),
  hero: {
    chip: {
      label: "Financial Services",
      color: "golden",
      icon: ActionBankIcon,
    },
    title: (
      <>
        Dust for
        <br /> Financial Services
      </>
    ),
    description:
      "AI agents for compliance, support, and growth. Transform financial operations with intelligent automation while maintaining the highest security and regulatory standards.",
    ctaButtons: {
      primary: {
        label: "Get started",
        href: "/home/pricing",
      },
      secondary: {
        label: "Talk to sales",
        href: "/home/contact",
      },
    },
    testimonialCard: {
      quote:
        "Dust helped us transform Kyriba's operations and foster a culture of continuous innovation.",
      author: {
        name: "Boris Lipiainen",
        title: "Chief Technology Officer",
      },
      company: {
        logo: "/static/landing/logos/white/kyriba.svg",
        alt: "Kyriba logo",
      },
      bgColor: "bg-violet-400",
      textColor: "text-white",
    },
    decorativeShapes: {
      topRight: "/static/landing/industry/shapes/rounded-rectangle.svg",
      bottomLeft: "/static/landing/industry/shapes/diamond.svg",
    },
  },
  aiAgents: {
    title: "AI agents for compliance, support, and growth",
    description:
      "Augment your compliance, support, and revenue teams with AI agents built for modern financial institutions. Dust connects your people, automates workflows, and delivers insights—so you can focus on growth, risk management, and exceptional client experience.",
    bgColor: "bg-gray-50",
  },
  trustedBy: {
    title: "Trusted by financial leaders",
    logoSet: "finance",
  },
  painPoints: {
    title: "Transform how you work",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Slash the cost and risk of compliance operations",
        description:
          "Automate KYC/KYB and onboarding. AI agents verify documents, flag risks, and answer compliance questions instantly—cutting manual work to minutes.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Transform support complexity into fast, confident answers",
        description:
          "Resolve  routine queries, route tough cases, and give support teams instant access to solutions—turning every ticket into searchable knowledge.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Achieve instant, precise, and relevant market engagement",
        description:
          "Equip your teams to deliver fast, accurate, and jargon-perfect answers—always aligned with the latest trends, regulations, and client expectations.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in action",
    useCases: [
      {
        title: "Compliance operations",
        image: "/static/landing/industry/features/Compliance_verification.webp",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "KYB & document review",
            description:
              "Instantly analyze and flag onboarding, KYC, and AML documents—extract key data and risks so compliance can focus on complex cases.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Automated document analysis",
            description:
              "Quickly process contracts and forms, detecting inconsistencies and non-compliance to reduce risk and speed reviews",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Compliance knowledge assistant",
            description:
              "Provide instant, reliable regulatory answers—always aligned with current global and local frameworks",
          },
          {
            icon: "bg-blue-400 rounded-tr-full",
            title: "Tax & regulation expertise",
            description:
              "Resolve tax, accounting, and regulatory questions for teams or clients in seconds, ensuring accurate, compliant decisions",
          },
        ],
      },
      {
        title: "Commercial operations",
        image: "/static/landing/industry/features/Sales_agent_2.webp",
        bgColor: "bg-purple-100",
        features: [
          {
            icon: "bg-pink-400",
            title: "Prospect account insights",
            description:
              "Enrich prospect profiles with financial and usage data for smarter qualification and engagement",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "Enterprise RFPs & solution proposals",
            description:
              "Draft tailored proposals using proven templates and real product configurations for faster turnaround",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Revenue intelligence",
            description:
              "Extract winning playbooks and coach sales teams in real time using insights from actual interactions",
          },
          {
            icon: "bg-blue-400 rounded-tr-full",
            title: "Market & solution research",
            description:
              "Compile market intelligence and track competitor, technology, and partnership opportunities",
          },
        ],
      },
      {
        title: "Support operations",
        image: "/static/landing/industry/features/Incident_copilot_slack.webp",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-green-500",
            title: "AI ticket deflection & smart routing",
            description:
              "Automatically resolve common inquiries and route complex issues to the right specialists",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Accelerated resolution",
            description:
              "Instantly find relevant docs, cases, and history so agents resolve issues faster and more accurately",
          },
          {
            icon: "bg-red-400 rounded-br-full",
            title: "Augmented knowledge base",
            description:
              "Turn support interactions into searchable, compliant knowledge for faster, consistent answers",
          },
          {
            icon: "bg-yellow-400",
            title: "Support analytics",
            description:
              "Gain actionable insights from support data to improve digital journeys and boost customer satisfaction",
          },
        ],
      },
      {
        title: "Marketing & content generation",
        image: "/static/landing/industry/features/Content_localization.webp",
        bgColor: "bg-golden-100",
        features: [
          {
            icon: "bg-golden-500",
            title: "Content creation & localization",
            description:
              "Instantly adapt content for multiple languages and regulations, ensuring accuracy and relevance",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Content optimization",
            description:
              "Turn drafts and technical docs into polished, SEO-ready, compliant assets",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Financial social media",
            description:
              "Generate compelling, insight-driven posts tailored for financial audiences",
          },
          {
            icon: "bg-red-400",
            title: "Market intelligence",
            description:
              "Track regulatory changes, competitors, and market trends in real time",
          },
        ],
      },
    ],
  },
  impactMetrics: {
    bgColor: "bg-blue-50",
    metrics: [
      {
        value: "70",
        unit: "%",
        type: "Reduction",
        description: "in content localization",
      },
      {
        value: "80",
        unit: "%",
        type: "Adoption",
        description: "weekly users at top financial leaders",
      },
      {
        value: "3",
        unit: "h",
        type: "Savings",
        description: "weekly hours saved overall",
      },
    ],
  },
  demoVideo: {
    sectionTitle: "See Dust in motion",
    videoUrl: "https://fast.wistia.net/embed/iframe/zzbhe95pvz",
  },
  testimonial: {
    quote:
      "Dust helped us transform Kyriba's operations and foster a culture of continuous innovation.",
    author: {
      name: "Boris Lipiainen",
      title: "Chief Technology Officer",
    },
    company: {
      logo: "/static/landing/logos/white/kyriba.svg",
      alt: "Kyriba logo",
    },
    bgColor: "bg-violet-400",
    textColor: "text-white",
  },
  customerStories: {
    title: "Customer stories",
    stories: [
      {
        title:
          "50,000 Hours Saved: How Qonto Revolutionized Compliance and Risk Assessment with AI",
        content:
          "Germi, Qonto’s AI assistant, analyzes German industry codes and screens prohibited activities, automating compliance checks across European markets.",
        href: "/blog/qonto-dust-ai-partnership",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Qonto-__-Dust.jpg",
      },
      {
        title: "Kyriba’s adoption of Dust across all functions",
        content:
          "43% of Kyriba employees save more than 3 hours weekly leveraging Dust for RFPs.",
        href: "/blog/kyriba-accelerating-innovation-with-dust",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Kyriba-__-Dust.png",
      },
      {
        title: "Pennylane’s journey to deploy Dust for Customer Care teams",
        content:
          "Dust evolved from a simple support tool into an integral part of Pennylane's operations.",
        href: "/blog/pennylane-customer-support-journey",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Pennylane-__-Dust.jpg",
      },
    ],
  },
  justUseDust: {
    title: "Just use Dust",
    titleColor: "text-blue-600",
    ctaButtons: {
      primary: {
        label: "Start Free Trial",
        href: "/api/workos/login",
      },
      secondary: {
        label: "Contact Sales",
        href: "/home/contact",
      },
    },
    bgColor: "bg-blue-50",
    decorativeShapes: true,
  },
};
