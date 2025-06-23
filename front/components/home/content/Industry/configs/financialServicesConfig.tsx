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
        "Dust helped us transform Kyriba's operations and foster a culture of continuous innovation.",
      author: {
        name: "Boris Lipiainen",
        title: "Chief Technology Officer",
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
        value: "80",
        unit: "%",
        type: "Adoption",
        description: "weekly users at top financial leaders",
      },
      {
        value: "3",
        unit: "h",
        type: "Savings",
        description: "weekly hours reported by half of Kyriba",
      },
    ],
  },
  demoVideo: {
    sectionTitle: "See Dust in motion",
    videoUrl: "https://fast.wistia.net/embed/iframe/zzbhe95pvz",
  },
  trustedBySecond: {
    title: "Trusted by financial leaders",
    logoSet: "finance",
  },
  testimonial: {
    quote:
      "Dust helped us transform Kyriba's operations and foster a culture of continuous innovation.",
    author: {
      name: "Boris Lipiainen",
      title: "Chief Technology Officer",
    },
    company: {
      logo: "/static/landing/logos/color/kyriba.png",
      alt: "Kyriba logo",
    },
    bgColor: "bg-golden-600",
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
        href: "https://blog.dust.tt/qonto-dust-ai-partnership/",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_qonto.png",
      },
      {
        title: "Kyriba’s adoption of Dust across all functions",
        content:
          "43% of Kyriba employees save more than 3 hours weekly leveraging Dust for RFPs.",
        href: "https://blog.dust.tt/kyriba-accelerating-innovation-with-dust/",
        src: "https://blog.dust.tt/content/images/size/w2000/2024/10/kyriba_dust.jpg",
      },
      {
        title: "Pennylane’s journey to deploy Dust for Customer Care teams",
        content:
          "Dust evolved from a simple support tool into an integral part of Pennylane's operations.",
        href: "https://blog.dust.tt/pennylane-dust-customer-support-journey/",
        src: "https://blog.dust.tt/content/images/size/w2000/2024/12/pennylane_dust_customer_story.png",
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
