import { SparklesIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import { createLayoutConfig } from "@app/components/home/content/Industry/configs/utils";

export const energyConfig: IndustryPageConfig = {
  seo: {
    title: "Dust for Energy & Utilities",
    description:
      "Streamline operations, reduce costs, and improve customer satisfaction with AI-powered automation for the energy sector.",
  },
  layout: createLayoutConfig([
    "hero",
    "painPoints",
    "dustInAction",
    "justUseDust",
  ]),

  hero: {
    chip: {
      label: "Energy & Utilities",
      color: "green",
      icon: SparklesIcon,
    },
    title: (
      <>
        Dust for
        <br /> Energy &<br /> Utilities
      </>
    ),
    description:
      "Streamline operations, reduce costs, and improve customer satisfaction with AI-powered automation for the energy sector.",
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
    heroImage: {
      src: "/static/landing/industry/Dust_connectors_microsoft.webp",
      alt: "Energy & Utilities AI-powered automation illustration",
    },
  },

  painPoints: {
    title: "Transform how you work",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Operational excellence: smart knowledge transfer",
        description:
          "Accelerate team performance by capturing and sharing expertise across distributed operations. Preserve institutional knowledge and standardize processes to boost project execution speed.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Customer success: unified information access",
        description:
          "Empower frontline teams with instant access to integrated systems for faster issue resolution. Enhance infrastructure diagnostics and deliver consistent service excellence.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Revenue growth: automated compliance workflows",
        description:
          "Streamline contract and regulatory document processing to accelerate project launches. Transform compliance monitoring into a competitive advantage for faster time-to-revenue.",
        color: "green",
      },
    ],
  },

  dustInAction: {
    title: "Dust in action",
    useCases: [
      {
        title: "Commercial operations",
        image: "/static/landing/industry/features/Doc_analysis.webp",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-red-500",
            title: "Documentation and process efficiency",
            description:
              "Accelerate RFP responses by extracting requirements from tender documents. Aggregate customer information into coherent briefings. Analyze agreements against templates for risk assessment.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Site evaluation and prioritization",
            description:
              "Rapidly assess potential infrastructure locations by aggregating market data, regulatory requirements, and technical feasibility studies for faster decision-making.",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Contract review and risk assessment",
            description:
              "Automatically analyze agreements, permits, and construction documents to identify non-standard clauses and jurisdiction-specific risks with negotiation support.",
          },
          {
            icon: "bg-green-500",
            title: "Customer briefing preparation",
            description:
              "Aggregate scattered information about customer sites, consumption history, and ongoing projects into coherent pre-meeting summaries saving hours of preparation time.",
          },
        ],
      },
      {
        title: "Customer service operations",
        image: "/static/landing/industry/features/Ticker_deflection.webp",
        bgColor: "bg-pink-100",
        features: [
          {
            icon: "bg-green-500",
            title: "Real-time problem resolution across distributed networks",
            description:
              "Instantly aggregate data from monitoring systems, customer history, and maintenance activities to provide service representatives with complete situational awareness.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Intelligent incident correlation",
            description:
              "Automatically connect customer complaints with real-time infrastructure status and similar incidents across the network to accelerate root cause identification.",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Technical issue translation",
            description:
              "Convert complex technical explanations into clear, customer-appropriate language while providing accurate restoration timelines based on similar past incidents.",
          },
        ],
      },
      {
        title: "Field operations",
        image: "/static/landing/industry/features/Document_generator.webp",
        bgColor: "bg-golden-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Information access and documentation efficiency",
            description:
              "Provide instant access to commissioning guides, firmware details, and safety protocols through natural language queries for diverse equipment configurations.",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "Cross-site knowledge propagation",
            description:
              "Automatically identify and share successful solutions discovered at one site with similar equipment across the network to scale expert knowledge.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Legal document extraction",
            description:
              "Extract key information from complex bundles of contracts, permits, and construction plans to help project managers understand site permissions instantly.",
          },
        ],
      },
      {
        title: "Project management & strategic operations",
        image: "/static/landing/industry/features/Radar_Monitoring.webp",
        bgColor: "bg-gray-100",
        features: [
          {
            icon: "bg-purple-500",
            title: "Planning, compliance, and business intelligence",
            description:
              "Analyze project documentation to identify bottlenecks and dependencies in the development cycle. Monitor regulatory changes and provide actionable compliance guidance.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Project communication",
            description:
              "Analyze project documentation to provide real-time status updates and coordinate activities across multiple teams and stakeholders automatically.",
          },
          {
            icon: "bg-green-500 rounded-br-full",
            title: "Industry research & news",
            description:
              "Aggregate insights from industry news, reports, and market analyses to identify specific opportunities and monitor trends for strategic planning.",
          },
        ],
      },
    ],
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
        title:
          "50% Time Savings: How Didomi Transformed Privacy Compliance with AI",
        content:
          "Didomi's legal team cuts workload by 50% using Dust's AI assistants for privacy compliance and legal document management.",
        href: "/customers/how-thomas-uses-ai-assistants-to-manage-legal-and-data-privacy-at-didomi",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_didomi.png",
      },
      {
        title:
          "50,000 Hours Saved: How Qonto Revolutionized Compliance and Risk Assessment with AI",
        content:
          "Germi, Qonto's AI assistant, analyzes German industry codes and screens prohibited activities, automating compliance checks across European markets.",
        href: "/customers/qonto-dust-ai-partnership",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Qonto-__-Dust.jpg",
      },
      {
        title: "Kyriba's adoption of Dust across all functions",
        content:
          "43% of Kyriba employees save more than 3 hours weekly leveraging Dust for RFPs.",
        href: "/customers/kyriba-accelerating-innovation-with-dust",
        src: "https://blog.dust.tt/content/images/size/w2000/2024/10/kyriba_dust.jpg",
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
        label: "Contact sales",
        href: "/home/contact",
      },
    },
    bgColor: "bg-blue-50",
    decorativeShapes: true,
  },
};
