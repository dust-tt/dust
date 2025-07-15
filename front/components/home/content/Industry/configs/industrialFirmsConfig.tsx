import { BarChartIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import { createLayoutConfig } from "@app/components/home/content/Industry/configs/utils";

export const industrialFirmsConfig: IndustryPageConfig = {
  layout: createLayoutConfig([
    "hero",
    "painPoints",
    "dustInAction",
    "justUseDust",
  ]),
  hero: {
    chip: {
      label: "Industrial Manufacturing",
      color: "blue",
      icon: BarChartIcon,
    },
    title: (
      <>
        Dust for
        <br /> Industrial
        <br /> Manufacturing
      </>
    ),
    description:
      "Empower every team with AI-powered workflows. From sales proposals to technical troubleshooting, give your entire organization instant access to expertise and streamlined operations.",
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
      alt: "Industrial Manufacturing AI-powered workflows illustration",
    },
  },
  painPoints: {
    title: "Transform how you work",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Give every team the power of AI—leave nobody behind",
        description:
          "From sales teams crafting proposals to technicians troubleshooting equipment, ensure every department has access to the same AI-powered capabilities. No more digital divides between functions.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Give everyone access to your best knowledge",
        description:
          "Your organization has decades of technical knowledge and commercial experience. Make that expertise instantly available to every employee, regardless of their role or experience level.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Accelerate operations without sacrificing precision",
        description:
          "Speed up everything from compliance documentation to customer responses while maintaining the quality and standards your industry demands. Let AI handle routine tasks so your teams focus on strategic work.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Top Use Cases for Industrial Firms",
    useCases: [
      {
        title: "Commercial & Sales",
        image: "/static/landing/industry/features/Sales_agent.webp",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Proposal & Quote Builder",
            description:
              "Create client proposals and presentation slides from RFQ requirements and product catalogs.",
          },
          {
            icon: "bg-pink-400 rounded-tr-full",
            title: "Contract Drafting",
            description:
              "Generate purchase and service agreements from negotiation notes and standard templates.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Customer Q&A Bot",
            description:
              "Answer product specs, delivery times, and warranty questions instantly.",
          },
          {
            icon: "bg-yellow-400 rounded-br-full",
            title: "Account Summaries",
            description:
              "Compile install base, order history, and service tickets for sales follow-up.",
          },
        ],
      },
      {
        title: "Technical Operations",
        image: "/static/landing/industry/features/Document_generator.webp",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-gray-600 rounded-tl-full",
            title: "Work Instructions & SOPs",
            description:
              "Update procedures, maintenance guides, and safety protocols from engineering changes.",
          },
          {
            icon: "bg-blue-500 rounded-tr-full",
            title: "Technical Troubleshooting",
            description:
              "Help technicians solve equipment problems with expert guidance and solutions.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Regulatory Documentation",
            description:
              "Generate compliance reports, safety filings, and certification materials.",
          },
          {
            icon: "bg-green-500",
            title: "Equipment Manual Search",
            description:
              "Find specific information across technical drawings, specs, and maintenance documents.",
          },
        ],
      },
      {
        title: "Training & Internal Support",
        image: "/static/landing/industry/features/Technical_helpdesk.webp",
        bgColor: "bg-orange-100",
        features: [
          {
            icon: "bg-red-500 rounded-br-full",
            title: "Training Material Generation",
            description:
              "Create safety training content, equipment guides, and onboarding materials.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Meeting Summaries & Project Updates",
            description:
              "Turn project discussions into clear action items and status reports.",
          },
          {
            icon: "bg-sky-400",
            title: "Internal Policy Help",
            description:
              "Answer employee questions about company policies, procedures, and guidelines.",
          },
          {
            icon: "bg-green-500 rounded-tr-full",
            title: "Technical Translation",
            description:
              "Translate safety documents, manuals, and procedures between languages.",
          },
        ],
      },
      {
        title: "Marketing & Intelligence",
        image: "/static/landing/industry/features/Radar_monitoring.webp",
        bgColor: "bg-rose-100",
        features: [
          {
            icon: "bg-red-500 rounded-br-full",
            title: "Technical Content Creation",
            description:
              "Generate product datasheets, application guides, and case studies.",
          },
          {
            icon: "bg-purple-500 rounded-tl-full",
            title: "Competitive Product Analysis",
            description:
              "Track competitor specifications, pricing, and market positioning.",
          },
          {
            icon: "bg-blue-500 rounded-tr-full",
            title: "Product Descriptions",
            description:
              "Create technical specifications and catalog content for new products.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Supplier Evaluation",
            description:
              "Analyze vendor capabilities, performance, and risk assessments.",
          },
        ],
      },
    ],
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
      {
        title:
          "50,000 Hours Saved: How Qonto Revolutionized Compliance and Risk Assessment with AI",
        content:
          "Germi, Qonto's AI assistant, analyzes German industry codes and screens prohibited activities, automating compliance checks across European markets.",
        href: "https://blog.dust.tt/qonto-dust-ai-partnership/",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_qonto.png",
      },
      {
        title: "Kyriba's adoption of Dust across all functions",
        content:
          "43% of Kyriba employees save more than 3 hours weekly leveraging Dust for RFPs.",
        href: "https://blog.dust.tt/kyriba-accelerating-innovation-with-dust/",
        src: "https://blog.dust.tt/content/images/size/w2000/2024/10/kyriba_dust.jpg",
      },
    ],
  },
  justUseDust: {
    title: "#JustUseDust",
    titleColor: "text-blue-600",
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
    bgColor: "bg-blue-50",
    decorativeShapes: true,
  },
};
