import { ActionHospitalIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import { createLayoutConfig } from "@app/components/home/content/Industry/configs/utils";

export const insuranceConfig: IndustryPageConfig = {
  seo: {
    title: "Dust for Insurance",
    description:
      "The AI Solution to streamline operations & enhance member experience. Transform insurance workflows with intelligent automation while ensuring compliance and improving customer satisfaction.",
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
      "The AI Solution to streamline operations & enhance member experience. Transform insurance workflows with intelligent automation while ensuring compliance and improving customer satisfaction.",
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
        logo: "/static/landing/logos/white/wakam.svg",
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
      "The AI Solution to streamline operations & enhance member experience",
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
        title: "Remove manual process bottlenecks",
        description:
          "Eliminate departmental silos and reduce manual work in claims, underwriting, and support to accelerate service delivery and decision-making.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Free up specialized personnel",
        description:
          "Free adjusters, underwriters, and legal experts from repetitive tasks, enabling focus on complex cases, risk assessment, and high-value interactions.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Unlock data intelligence",
        description:
          "Leverage customer interactions, claims histories, and regulatory data to optimize pricing, enhance products, mitigate risks, and ensure compliance.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in action",
    useCases: [
      {
        title: "Customer service",
        image: "/static/landing/industry/features/UxWriter.webp",
        bgColor: "bg-golden-100",
        features: [
          {
            icon: "bg-golden-500",
            title: "Smart claims handling",
            description:
              "Automate insurance processing – document verification, risk assessment, coverage validation – accelerating settlements.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Support resolution",
            description:
              "Enable help desk teams to instantly resolve customer inquiries about policy details, account status, and troubleshooting without escalation.",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Insurance expert",
            description:
              "Answer colleague questions about insurance products, coverage, and insurer agreements on behalf of experts.",
          },
          {
            icon: "bg-red-400",
            title: "Documentation generation",
            description:
              "Produce compliant and relevant documentation on your insurance products, in all languages, to deflect basic questions",
          },
        ],
      },
      {
        title: "Business development",
        image: "/static/landing/industry/features/Compliance_verification.webp",
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
            title: "RFP automation",
            description:
              "Generate detailed RFP responses and business offerings using past proposals and internal documentation",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Content generation",
            description:
              "Create and validate content, insurance comparisons, and website materials in all languages while ensuring accuracy and compliance",
          },
          {
            icon: "bg-red-400",
            title: "Sales intelligence",
            description:
              "Analyze customer interactions and policy data to generate actionable insights for sales teams and optimize insurance product positioning",
          },
        ],
      },
      {
        title: "Legal & compliance support",
        image: "/static/landing/industry/features/Legal_review_3.webp",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-golden-500",
            title: "Partner & customer due diligence",
            description:
              "Evaluate new business applications and potential partnerships to identify and assess potential risks and concerns",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Contracts & policy documentation",
            description:
              "Review program documentation, policy wordings, and contractual agreements for accuracy, compliance, and key provisions",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Regulatory guidance",
            description:
              "Address regulatory inquiries and support the implementation and monitoring of compliance processes",
          },
        ],
      },
      {
        title: "Intelligence",
        image: "/static/landing/industry/features/Radar_AIDigest.webp",
        bgColor: "bg-gray-950",
        features: [
          {
            icon: "bg-golden-500",
            title: "Market & competitor updates",
            description:
              "Track and analyze industry developments and competitor activities",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Regulatory monitoring",
            description:
              "Monitor the evolving regulatory landscape and disseminate updates to ensure organizational awareness",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Offer benchmarking",
            description:
              "Evaluate internal program structures and operational performance against relevant market standards and best practices",
          },
          {
            icon: "bg-red-400",
            title: "Claims insights",
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
      logo: "/static/landing/logos/white/wakam.svg",
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
        href: "/customers/generative-ai-insights-alan-payfit-leaders",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/01/Founder.jpg",
      },
      {
        title: "Wakam scales AI adoption with Dust with 130+ agents",
        content:
          "Wakam achieves 75% adoption rate with self-service AI capabilities, reducing partner processing time by up to 90%.",
        href: "/customers/wakam-empowers-teams-with-self-service-data-intelligence-while-reducing-processing-time",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Wakam.jpg",
      },
      {
        title: "Alan's teams save 3h weekly scraping sales transcripts",
        content:
          "Alan’s sales & marketing team transforms sales conversations into intelligence with AI agents",
        href: "/customers/alans-pmm-team-transforms-sales-conversations-into-intelligence-with-ai-agents",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Alan-__-Dust-1-1.png",
      },
      {
        title: "Wakam cuts legal contract analysis time by 50% with Dust",
        content:
          "How Wakam developed specialized AI agents to automate contract analysis, data extraction, and regulatory monitoring.",
        href: "/customers/how-wakam-cut-legal-contract-analysis-time-by-50-with-dust",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Wakam_Dust.png",
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
