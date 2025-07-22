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
            icon: "bg-yellow-400 rounded-br-full",
            title: "Account Intelligence",
            description:
              "Compile customer insights from your CRM, service tickets, and sales conversations in all languages for strategic account planning.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Technical Proposal Engine",
            description:
              "Generate RFP responses by synthesizing product catalogs, past proposals, and engineering specifications from your knowledge base.",
          },
          {
            icon: "bg-pink-400 rounded-tr-full",
            title: "Contract Intelligence Platform",
            description:
              "Draft MSAs and service agreements using your organization's contract templates, negotiation history, and legal precedents.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Technical Specification Assistant",
            description:
              "Answer product specs and compliance questions by accessing your certification databases, test reports, and technical documentation.",
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
            title: "Work Instruction Automation",
            description:
              "Update SOPs and maintenance procedures using your engineering change orders, incident reports, and tribal knowledge.",
          },
          {
            icon: "bg-blue-500 rounded-tr-full",
            title: "Expert Diagnostic Assistant",
            description:
              "Troubleshoot equipment issues by accessing your maintenance logs, failure analyses, and technician expertise.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Regulatory Compliance Engine",
            description:
              "Generate compliance documentation using your quality management system, audit reports, and regulatory databases.",
          },
          {
            icon: "bg-green-500",
            title: "Technical Documentation Intelligence",
            description:
              "Search across your P&IDs, equipment manuals, and engineering drawings with intelligent cross-referencing.",
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
            title: "Competency Development Platform",
            description:
              "Create training materials using your safety procedures, equipment knowledge, and expert conversations.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Engineering Review Documentation",
            description:
              "Structure project updates by synthesizing meeting notes, technical discussions, and design reviews from your teams.",
          },
          {
            icon: "bg-sky-400",
            title: "Policy Intelligence Assistant",
            description:
              "Answer operational questions using your quality manuals, EHS procedures, and internal guidelines.",
          },
          {
            icon: "bg-green-500 rounded-tr-full",
            title: "Technical Knowledge Transfer",
            description:
              "Preserve and share expertise by capturing insights from your technical conversations and documentation.",
          },
        ],
      },
      {
        title: "Marketing & Intelligence",
        image: "/static/landing/industry/features/Radar_Monitoring.webp",
        bgColor: "bg-rose-100",
        features: [
          {
            icon: "bg-red-500 rounded-br-full",
            title: "Technical Content Generation",
            description:
              "Create datasheets and application guides using your product specifications, test data, and application expertise.",
          },
          {
            icon: "bg-purple-500 rounded-tl-full",
            title: "Market Intelligence Platform",
            description:
              "Analyze competitive positioning using your market research, customer feedback, and sales intelligence.",
          },
          {
            icon: "bg-blue-500 rounded-tr-full",
            title: "Product Portfolio Intelligence",
            description:
              "Develop technical content by connecting your R&D insights, customer requirements, and application knowledge.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Supplier Intelligence Hub",
            description:
              "Evaluate vendors using your procurement data, supplier assessments, and supply chain expertise.",
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
