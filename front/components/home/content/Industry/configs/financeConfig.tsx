import { BarChartIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";

export const financeConfig: IndustryPageConfig = {
  hero: {
    chip: {
      label: "Finance",
      color: "golden",
      icon: BarChartIcon,
    },
    title: (
      <>
        Dust for
        <br /> Finance
      </>
    ),
    description:
      "Transform your financial operations with AI. Automate reporting, compliance, and analysis while maintaining accuracy and security.",
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
        "Dust has revolutionized our financial reporting processes, saving us 20+ hours weekly.",
      author: {
        name: "Sarah Johnson",
        title: "CFO at TechCorp",
      },
      company: {
        logo: "/static/landing/logos/color/placeholder.png",
        alt: "TechCorp logo",
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
    title: "What if your finance team was always ahead?",
    description:
      "Deploy AI agents that automate financial analysis, generate reports, and ensure compliance—freeing your team to focus on strategic decision-making and growth initiatives.",
    bgColor: "bg-gray-50",
  },
  trustedBy: {
    title: "Trusted by finance leaders",
    logoSet: "default", // You can create a finance-specific logoSet later
  },
  painPoints: {
    title: "Streamline your financial operations",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Automate repetitive reporting",
        description:
          "Eliminate manual data entry and report generation. Let AI handle routine financial reports while you focus on analysis and insights.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-golden.svg",
        title: "Ensure compliance excellence",
        description:
          "Stay ahead of regulatory requirements with AI that monitors compliance, tracks changes, and alerts you to potential issues.",
        color: "golden",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Accelerate financial insights",
        description:
          "Transform raw financial data into actionable insights with AI-powered analysis and forecasting.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in Action",
    useCases: [
      {
        title: "Financial Reporting & Analysis",
        image: "/static/landing/industry/features/financial_reporting.svg",
        bgColor: "bg-golden-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Automated Report Generation",
            description:
              "Generate monthly, quarterly, and annual reports automatically from your financial systems",
          },
          {
            icon: "bg-golden-400 rounded-tr-full",
            title: "Variance Analysis",
            description:
              "AI-powered analysis of budget vs. actual performance with explanatory insights",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Forecast Modeling",
            description:
              "Build dynamic financial models and scenario planning with AI assistance",
          },
        ],
      },
      {
        title: "Compliance & Risk Management",
        image: "/static/landing/industry/features/compliance.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-red-500",
            title: "Regulatory Monitoring",
            description:
              "Track regulatory changes and assess impact on your financial operations",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Risk Assessment",
            description:
              "AI-driven risk analysis across portfolio, credit, and operational areas",
          },
          {
            icon: "bg-golden-400 rounded-br-full",
            title: "Audit Preparation",
            description:
              "Streamline audit processes with automated documentation and evidence gathering",
          },
        ],
      },
      {
        title: "Compliance & Risk Management",
        image: "/static/landing/industry/features/compliance.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-red-500",
            title: "Regulatory Monitoring",
            description:
              "Track regulatory changes and assess impact on your financial operations",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Risk Assessment",
            description:
              "AI-driven risk analysis across portfolio, credit, and operational areas",
          },
          {
            icon: "bg-golden-400 rounded-br-full",
            title: "Audit Preparation",
            description:
              "Streamline audit processes with automated documentation and evidence gathering",
          },
        ],
      },
    ],
  },
  impactMetrics: {
    bgColor: "bg-golden-50",
    metrics: [
      {
        value: "20",
        unit: "h",
        type: "Saved",
        description: "weekly in financial reporting and analysis tasks",
      },
      {
        value: "95",
        unit: "%",
        type: "Accuracy",
        description: "in automated compliance monitoring and reporting",
      },
      {
        value: "60",
        unit: "%",
        type: "Faster",
        description: "month-end close process with automated workflows",
      },
    ],
  },
  demoVideo: {
    sectionTitle: "See Dust transform finance operations",
    videoUrl: "https://fast.wistia.net/embed/iframe/placeholder",
  },
  trustedBySecond: {
    title: "Trusted by finance leaders",
    logoSet: "default",
  },
  testimonial: {
    quote:
      "Dust has revolutionized our financial reporting processes, saving us 20+ hours weekly while improving accuracy.",
    author: {
      name: "Sarah Johnson",
      title: "CFO at TechCorp",
    },
    company: {
      logo: "/static/landing/logos/color/placeholder.png",
      alt: "TechCorp logo",
    },
    bgColor: "bg-blue-600",
    textColor: "text-white",
  },
  customerStories: {
    title: "Finance success stories",
    stories: [
      {
        title: "How TechCorp automated their monthly close process",
        content:
          "TechCorp reduced their month-end close from 5 days to 2 days using Dust's automated reporting and reconciliation agents.",
        href: "https://blog.dust.tt/placeholder-finance-story/",
        src: "https://blog.dust.tt/content/images/placeholder.jpg",
      },
      {
        title: "Finance team productivity gains with AI assistants",
        content:
          "Leading finance teams share how Dust agents deliver significant productivity improvements in financial operations.",
        href: "https://blog.dust.tt/placeholder-finance-productivity/",
        src: "https://blog.dust.tt/content/images/placeholder2.jpg",
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
