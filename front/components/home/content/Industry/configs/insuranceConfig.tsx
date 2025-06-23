import { ActionHospitalIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";

export const insuranceConfig: IndustryPageConfig = {
  hero: {
    chip: {
      label: "Insurance",
      color: "blue",
      icon: ActionHospitalIcon,
    },
    title: (
      <>
        Dust for
        <br /> Insurance
      </>
    ),
    description:
      "The AI Solution to Streamline Operations & Enhance Member Experience. Transform insurance workflows with intelligent automation while ensuring compliance and improving customer satisfaction.",
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
        "Dust isn't just about saving time—it's about making better, more informed decisions.",
      author: {
        name: "Etienne Debost",
        title: "Head of Architecture",
      },
      company: {
        logo: "/static/landing/logos/color/wakam.png",
        alt: "Wakam",
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
    title:
      "The AI Solution to Streamline Operations & Enhance Member Experience",
    description:
      "Deploy specialized AI agents that automate insurance workflows, enhance member service, and ensure regulatory compliance—transforming how your organization operates while improving customer satisfaction and operational efficiency.",
    bgColor: "bg-gray-50",
  },
  trustedBy: {
    title: "Trusted by insurance leaders",
    logoSet: "insurance",
  },
  painPoints: {
    title: "Transform how you work",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Automate Manual Insurance Operations",
        description:
          "Streamline claims processing, policy management, and underwriting workflows to reduce manual effort and improve operational efficiency across all departments.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Enhance Member Experience & Support",
        description:
          "Provide instant, accurate responses to member inquiries while maintaining compliance with insurance regulations and improving customer satisfaction scores.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Optimize Risk Assessment & Analytics",
        description:
          "Leverage AI-powered insights for better risk assessment, fraud detection, and data-driven decision making to improve profitability and member outcomes.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in Action",
    useCases: [
      {
        title: "Customer Service",
        image: "/static/landing/industry/features/uxWriter.svg",
        bgColor: "bg-orange-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "AI-Powered Member Support",
            description:
              "Instantly resolve member queries with AI assistants trained on policy information and procedures",
          },
          {
            icon: "bg-orange-400 rounded-tr-full",
            title: "Claims Status & Updates",
            description:
              "Provide real-time claims status updates and automated member communications",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Policy Information Access",
            description:
              "Enable instant access to policy details, coverage information, and member history",
          },
        ],
      },
      {
        title: "Business Development",
        image: "/static/landing/industry/features/KYC.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-purple-500",
            title: "Lead Qualification & Scoring",
            description:
              "AI-driven prospect analysis and risk assessment for more effective sales targeting",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Quote Generation & Processing",
            description:
              "Automated quote generation based on risk profiles and competitive analysis",
          },
          {
            icon: "bg-green-400 rounded-br-full",
            title: "Market Intelligence",
            description:
              "Competitive analysis and market trend identification for strategic business growth",
          },
        ],
      },
      {
        title: "Legal & Compliance Support",
        image: "/static/landing/industry/features/legalReview3.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-red-500",
            title: "Regulatory Monitoring",
            description:
              "Automated tracking of regulatory changes and compliance requirements across jurisdictions",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Document Review & Analysis",
            description:
              "AI-powered contract review, policy analysis, and legal document processing",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Audit Trail Management",
            description:
              "Comprehensive audit trail generation and compliance reporting automation",
          },
        ],
      },
      {
        title: "Intelligence",
        image: "/static/landing/industry/features/Radar.svg",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-green-500",
            title: "Fraud Detection & Prevention",
            description:
              "Advanced AI algorithms to identify suspicious patterns and prevent fraudulent claims",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Risk Analytics & Modeling",
            description:
              "Predictive risk modeling and analytics for better underwriting decisions",
          },
          {
            icon: "bg-orange-400 rounded-br-full",
            title: "Performance Intelligence",
            description:
              "Business intelligence dashboards and automated reporting for strategic insights",
          },
        ],
      },
    ],
  },
  impactMetrics: {
    bgColor: "bg-blue-50",
    metrics: [
      {
        value: "50",
        unit: "%",
        type: "Reduction",
        description: "in legal contract processing time",
      },
      {
        value: "90",
        unit: "%",
        type: "Faster",
        description: "partner 360 analysis",
      },
      {
        value: "80%",
        unit: "%",
        type: "adoption",
        description: "weekly active users",
      },
    ],
  },
  demoVideo: {
    sectionTitle: "See Dust in motion",
    videoUrl: "https://fast.wistia.net/embed/iframe/8q80neektv",
  },
  trustedBySecond: {
    title: "Trusted by insurance leaders",
    logoSet: "default",
  },
  testimonial: {
    quote:
        "Dust isn't just about saving time—it's about making better, more informed decisions.",
      author: {
        name: "Etienne Debost",
        title: "Head of Architecture",
      },
      company: {
        logo: "/static/landing/logos/color/wakam.png",
        alt: "Wakam",
      },
      bgColor: "bg-blue-600",
      textColor: "text-white",
  },
  customerStories: {
    title: "Customer stories",
    stories: [
      {
        title:
          "20%+ productivity gains in Sales: Insights from Alan and Payfit",
        content:
          "Leading companies share how Dust agents deliver significant productivity improvements and measurable ROI in sales operations.",
        href: "https://blog.dust.tt/generative-ai-insights-alan-payfit-leaders/",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/01/Founder.jpg",
      },
      // {
      //   title: "How Wakam Achieved 70% Company-Wide AI Adoption with 100+ Custom Agents",
      //   content:
      //     "Wakam transforms European insurance operations with AI, achieving 70% employee adoption and 90% productivity gains across 136 deployed agents.",
      //   href: "TO BE ADDED",
      //   src: "TO BE ADDED",
      // },
      {
        title:
          "Wakam transforms legal workflows: 50% faster contract analysis with Dust",
        content:
          "Wakam slashes legal contract analysis time 50% using AI agents for document processing, compliance verification, and multilingual translation.",
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
