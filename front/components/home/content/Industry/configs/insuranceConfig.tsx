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
        title: "Remove Manual Process Bottlenecks",
        description:
          "Eliminate departmental silos and reduce manual work in claims, underwriting, and support to accelerate service delivery and decision-making.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Free Up Specialized Personnel",
        description:
          "Free adjusters, underwriters, and legal experts from repetitive tasks, enabling focus on complex cases, risk assessment, and high-value interactions.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Unlock Data Intelligence",
        description:
          "Leverage customer interactions, claims histories, and regulatory data to optimize pricing, enhance products, mitigate risks, and ensure compliance.",
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
            icon: "bg-golden-500",
            title: "Smart Claims Handling",
            description:
              "Automate insurance processing – document verification, risk assessment, coverage validation – accelerating settlements.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Support Resolution",
            description:
              "Enable help desk teams to instantly resolve customer inquiries about policy details, account status, and troubleshooting without escalation.",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Insurance Expert",
            description:
              "Answer colleague questions about insurance products, coverage, and insurer agreements on behalf of experts.",
          },
          {
            icon: "bg-red-400",
            title: "Documentation Generation",
            description:
              "Produce compliant and relevant documentation on your insurance products, in all languages, to deflect basic questions",
          },
        ],
      },
      {
        title: "Business Development",
        image: "/static/landing/industry/features/KYC.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-golden-500",
            title: "Client & Partner 360",
            description:
              "Create comprehensive client and partner summaries by consolidating past interactions, internal data, and relevant external information",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "RFP Automation",
            description:
              "Generate detailed RFP responses and business offerings using past proposals and internal documentation",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Content Generation",
            description:
              "Create and validate content, insurance comparisons, and website materials in all languages while ensuring accuracy and compliance",
          },
          {
            icon: "bg-red-400",
            title: "Sales Intelligence",
            description:
              "Analyze customer interactions and policy data to generate actionable insights for sales teams and optimize insurance product positioning",
          },
        ],
      },
      {
        title: "Legal & Compliance Support",
        image: "/static/landing/industry/features/legalReview3.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-golden-500",
            title: "Partner & Customer Due Diligence",
            description:
              "Evaluate new business applications and potential partnerships to identify and assess potential risks and concerns",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Contracts & Policy Documentation",
            description:
              "Review program documentation, policy wordings, and contractual agreements for accuracy, compliance, and key provisions",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Regulatory Guidance",
            description:
              "Address regulatory inquiries and support the implementation and monitoring of compliance processes",
          },
        ],
      },
      {
        title: "Intelligence",
        image: "/static/landing/industry/features/Radar.svg",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-golden-500",
            title: "Market & Competitor Updates",
            description:
              "Track and analyze industry developments and competitor activities",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Regulatory Monitoring",
            description:
              "Monitor the evolving regulatory landscape and disseminate updates to ensure organizational awareness",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Offer Benchmarking",
            description:
              "Evaluate internal program structures and operational performance against relevant market standards and best practices",
          },
          {
            icon: "bg-red-400",
            title: "Claims Insights",
            description:
              "Analyze claims performance, financial settlements, and profitability across different broker partnerships or distribution channels",
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
        value: "80",
        unit: "%",
        type: "Adoption",
        description: "weekly active users",
      },
    ],
  },
  demoVideo: {
    sectionTitle: "See Dust in motion",
    videoUrl: "https://fast.wistia.net/embed/iframe/zzbhe95pvz",
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
      // {
      //   title:
      //     "Wakam transforms legal workflows: 50% faster contract analysis with Dust",
      //   content:
      //     "Wakam slashes legal contract analysis time 50% using AI agents for document processing, compliance verification, and multilingual translation.",
      //   href: "https://blog.dust.tt/how-thomas-uses-ai-assistants-to-manage-legal-and-data-privacy-at-didomi/",
      //   src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_didomi.png",
      // },
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
