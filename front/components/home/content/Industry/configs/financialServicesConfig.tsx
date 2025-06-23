import { ActionBankIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";

export const financialServicesConfig: IndustryPageConfig = {
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
      "AI Agents for Compliance, Support, and Growth. Transform financial operations with intelligent automation while maintaining the highest security and regulatory standards.",
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
        "Dust is more than just a tool, it's a catalyst for innovation in financial services.",
      author: {
        name: "David Anderson",
        title: "Head of Operations",
      },
      company: {
        logo: "/static/landing/logos/color/kyriba.png",
        alt: "Kyriba logo",
      },
      bgColor: "bg-golden-600",
      textColor: "text-white",
    },
    decorativeShapes: {
      topRight: "/static/landing/industry/shapes/rounded-rectangle.svg",
      bottomLeft: "/static/landing/industry/shapes/diamond.svg",
    },
  },
  aiAgents: {
    title: "AI Agents for Compliance, Support, and Growth",
    description:
      "Deploy specialized AI agents that handle complex financial workflows, ensure regulatory compliance, and enhance customer experiences—while maintaining the security and precision your industry demands.",
    bgColor: "bg-gray-50",
  },
  trustedBy: {
    title: "Trusted by financial leaders",
    logoSet: "default",
  },
  painPoints: {
    title: "Transform how you work",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Scale Due Diligence and Operations for Financial Operations",
        description:
          "Automate complex financial workflows, regulatory reporting, and compliance monitoring to scale operations efficiently without compromising accuracy.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Enhance Support, Ensure Security & Compliant Answers",
        description:
          "Provide instant, accurate responses to client inquiries while maintaining strict compliance with financial regulations and security protocols.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Optimize Processes and Enable Market Engagement",
        description:
          "Leverage AI-powered insights to optimize investment strategies, risk assessment, and client relationship management for sustainable growth.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in Action",
    useCases: [
      {
        title: "Compliance Operations",
        image: "/static/landing/industry/features/KYC.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Regulatory Monitoring",
            description:
              "Automated tracking of regulatory changes and impact assessment on operations",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "Risk & Compliance Reporting",
            description:
              "Generate comprehensive compliance reports and risk assessments automatically",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Audit Trail Management",
            description:
              "Maintain detailed audit trails and documentation for regulatory compliance",
          },
        ],
      },
      {
        title: "Prospect Account Insights",
        image: "/static/landing/industry/features/SalesAnalyst.svg",
        bgColor: "bg-purple-100",
        features: [
          {
            icon: "bg-purple-500",
            title: "Advanced Account Analysis",
            description:
              "Deep financial analysis and risk profiling of potential clients and investments",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Market Intelligence",
            description:
              "Real-time market data analysis and investment opportunity identification",
          },
          {
            icon: "bg-golden-400 rounded-br-full",
            title: "Client & Portfolio Screening",
            description:
              "Automated KYC, AML screening, and portfolio optimization recommendations",
          },
        ],
      },
      {
        title: "Support Operations",
        image: "/static/landing/industry/features/incidentCopilot.svg",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-green-500",
            title: "Intelligent Client Support",
            description:
              "AI-powered client service with instant access to account information and compliance-checked responses",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Automated Documentation",
            description:
              "Generate client communications, reports, and documentation automatically",
          },
          {
            icon: "bg-red-400 rounded-br-full",
            title: "Support Analytics",
            description:
              "Track client satisfaction, identify trends, and optimize service delivery",
          },
        ],
      },
      {
        title: "Marketing & Content Generation",
        image: "/static/landing/industry/features/marketing_operations.svg",
        bgColor: "bg-golden-100",
        features: [
          {
            icon: "bg-golden-500",
            title: "Compliant Content Creation",
            description:
              "Generate marketing materials and client communications that meet regulatory requirements",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Market Research & Analysis",
            description:
              "Automated market research, competitor analysis, and investment insights",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Client Communication",
            description:
              "Personalized client updates, market commentary, and investment recommendations",
          },
        ],
      },
    ],
  },
  impactMetrics: {
    bgColor: "bg-golden-50",
    metrics: [
      {
        value: "75",
        unit: "%",
        type: "Reduction",
        description: "in compliance reporting time with automated workflows",
      },
      {
        value: "90",
        unit: "%",
        type: "Accuracy",
        description: "in regulatory compliance monitoring and risk assessment",
      },
      {
        value: "50",
        unit: "%",
        type: "Faster",
        description: "client onboarding and KYC processing",
      },
    ],
  },
  demoVideo: {
    sectionTitle: "See Dust transform financial services",
    videoUrl: "https://fast.wistia.net/embed/iframe/8q80neektv",
  },
  trustedBySecond: {
    title: "Trusted by financial leaders",
    logoSet: "default",
  },
  testimonial: {
    quote:
      "Dust is the most impactful software we've adopted since building Clay.",
    author: {
      name: "Everett Berry",
      title: "Head of GTM Engineering at Clay",
    },
    company: {
      logo: "/static/landing/logos/color/clay_white.png",
      alt: "Clay logo",
    },
    bgColor: "bg-green-600",
    textColor: "text-white",
  },
  customerStories: {
    title: "Customer stories",
    stories: [
      {
        title: "How Clay is powering 4x team growth with Dust",
        content:
          "Clay uses Dust AI agents to scale their GTM team 4x while maintaining sales velocity and achieving 100% adoption across their growing team.",
        href: "https://blog.dust.tt/clay-scaling-gtme-team/",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/06/clay_dust_agents.jpg",
      },
      {
        title:
          "20%+ productivity gains in Sales: Insights from Alan and Payfit",
        content:
          "Leading companies share how Dust agents deliver significant productivity improvements and measurable ROI in sales operations.",
        href: "https://blog.dust.tt/generative-ai-insights-alan-payfit-leaders/",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/01/Founder.jpg",
      },
      {
        title:
          "50% Time Savings: How Didomi Transformed Privacy Compliance with AI",
        content:
          "Didomi's legal team cuts workload by 50% using Dust's AI assistants for privacy compliance and legal document management.",
        href: "https://blog.dust.tt/how-thomas-uses-ai-assistants-to-manage-legal-and-data-privacy-at-didomi/",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_didomi.png",
      },
    ],
  },
  justUseDust: {
    title: "Just use Dust",
    titleColor: "text-golden-600",
    ctaButtons: {
      primary: {
        label: "Start Free Trial",
        href: "/api/auth/login",
      },
      secondary: {
        label: "Contact Sales",
        href: "/home/contact",
      },
    },
    bgColor: "bg-golden-50",
    decorativeShapes: true,
  },
};
