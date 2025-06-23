import { ActionBriefcaseIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";

export const investmentFirmsConfig: IndustryPageConfig = {
  hero: {
    chip: {
      label: "Investment Firms",
      color: "blue",
      icon: ActionBriefcaseIcon,
    },
    title: (
      <>
        Dust for
        <br /> Investment Firms
      </>
    ),
    description:
      "Transform investment operations with AI-powered solutions that streamline due diligence, enhance portfolio management, and optimize research workflows for superior investment outcomes.",
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
        "Dust is the most impactful software we've adopted since building Clay.",
      author: {
        name: "Alexandra Thompson",
        title: "Managing Partner",
      },
      company: {
        logo: "/static/landing/logos/color/placeholder.png",
        alt: "Investment Firm logo",
      },
      bgColor: "bg-blue-600",
      textColor: "text-white",
    },
    decorativeShapes: {
      topRight: "/static/landing/industry/shapes/rounded-rectangle.svg",
      bottomLeft: "/static/landing/industry/shapes/diamond.svg",
    },
  },
  aiAgents: {
    title: "3 Pain points Dust solves",
    description:
      "Deploy specialized AI agents that transform investment workflows, from target identification to portfolio management, helping firms make data-driven investment decisions with greater efficiency.",
    bgColor: "bg-gray-50",
  },
  trustedBy: {
    title: "Trusted by investment leaders",
    logoSet: "default",
  },
  painPoints: {
    title: "3 Pain points Dust solves",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Operational Costs: Optimize & Streamline Transfer",
        description:
          "Reduce operational overhead through automated workflow management, streamlined due diligence processes, and intelligent resource allocation across investment operations.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Customer Retention: Enhanced Information Access",
        description:
          "Improve client relationships with AI-powered investment insights, automated reporting, and enhanced communication of portfolio performance and market analysis.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Revenue Linkage: Data-Driven Decision Workflows",
        description:
          "Leverage AI insights for strategic investment decisions, market analysis, and portfolio optimization through intelligent data synthesis and predictive analytics.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in Action",
    useCases: [
      {
        title: "Target Identification & Research",
        image: "/static/landing/industry/features/target_research.svg",
        bgColor: "bg-gray-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Sector Research",
            description:
              "Comprehensive market analysis and sector-specific research with AI-powered data synthesis",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "Target Intelligence",
            description:
              "AI-driven target company analysis and competitive intelligence gathering",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Market Evaluation",
            description:
              "Automated market assessment and opportunity identification for investment targets",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Financial Metrics",
            description:
              "Intelligent financial analysis and key performance indicators extraction",
          },
        ],
      },
      {
        title: "Due Diligence",
        image: "/static/landing/industry/features/due_diligence.svg",
        bgColor: "bg-golden-100",
        features: [
          {
            icon: "bg-red-500",
            title: "Document Status Briefing",
            description:
              "Automated document review and comprehensive status reporting for due diligence processes",
          },
          {
            icon: "bg-golden-400 rounded-tr-full",
            title: "Risk Assessment",
            description:
              "AI-powered risk analysis and mitigation strategy development for investment decisions",
          },
          {
            icon: "bg-blue-500 rounded-bl-full",
            title: "Financial Analysis",
            description:
              "Comprehensive financial modeling and analysis with automated insights generation",
          },
        ],
      },
      {
        title: "Portfolio Support",
        image: "/static/landing/industry/features/portfolio_support.svg",
        bgColor: "bg-gray-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Board Preparation",
            description:
              "Automated board meeting preparation with comprehensive portfolio insights and performance analysis",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "Performance Monitoring",
            description:
              "Real-time portfolio monitoring with automated alerts and performance tracking systems",
          },
          {
            icon: "bg-green-400 rounded-bl-full",
            title: "Strategic Advisory",
            description:
              "AI-driven strategic recommendations and advisory support for portfolio companies",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Value Creation",
            description:
              "Intelligent value creation strategies and operational improvement recommendations",
          },
        ],
      },
      {
        title: "Reporting & Content",
        image: "/static/landing/industry/features/reporting_content.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-red-500",
            title: "LP Portfolio Operations",
            description:
              "Automated limited partner reporting and portfolio performance communications",
          },
          {
            icon: "bg-golden-400 rounded-tr-full",
            title: "Marketing & Social",
            description:
              "AI-powered marketing content creation and social media management for investment firms",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Compliance Support",
            description:
              "Automated compliance monitoring and regulatory reporting for investment operations",
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
        type: "Faster",
        description: "due diligence and research processes",
      },
      {
        value: "85",
        unit: "%",
        type: "Improvement",
        description: "in portfolio monitoring and reporting efficiency",
      },
      {
        value: "60",
        unit: "%",
        type: "Reduction",
        description: "in operational costs and manual workflows",
      },
    ],
  },
  demoVideo: {
    sectionTitle: "See Dust transform investment operations",
    videoUrl: "https://fast.wistia.net/embed/iframe/8q80neektv",
  },
  trustedBySecond: {
    title: "Trusted by investment leaders",
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
    titleColor: "text-blue-600",
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
    bgColor: "bg-blue-50",
    decorativeShapes: true,
  },
};
