import { BarChartIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import { createLayoutConfig } from "@app/components/home/content/Industry/configs/utils";

export const industrialFirmsConfig: IndustryPageConfig = {
  seo: {
    title: "Dust for Industrial Manufacturing",
    description:
      "Empower every team with AI-powered workflows. From sales proposals to technical troubleshooting, give your entire organization instant access to expertise and streamlined operations.",
  },
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
        title: "Break down knowledge silos across functions",
        description:
          "Make technical expertise, safety procedures, and commercial knowledge instantly accessible to every employee across manufacturing, engineering, sales, and operations.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Eliminate manual processes that drain productivity",
        description:
          "Let AI handle repetitive tasks like processing vendor documents, navigating compliance manuals, or updating systems while experts focus on strategic work.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Connect systems while maintaining security control",
        description:
          "Unify scattered enterprise systems—CRM, ERP, SharePoint, technical databases—into one intelligent platform with enterprise-grade security and departmental access control.",
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
            title: "Technical Proposal Engine",
            description:
              "Generate RFP responses using product catalogs, past proposals, and engineering specifications.",
          },
          {
            icon: "bg-pink-400 rounded-tr-full",
            title: "Contract Intelligence Platform",
            description:
              "Draft agreements using contract templates, negotiation history, and legal precedents.",
          },
          {
            icon: "bg-yellow-400 rounded-br-full",
            title: "Account Intelligence Dashboard",
            description:
              "Compile customer insights from CRM, service tickets, and sales conversations.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "RFP Analysis & Vendor Comparison",
            description:
              "Analyze vendor responses with synthesis grids and key differentiator identification.",
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
              "Update SOPs and maintenance procedures using engineering changes and incident reports.",
          },
          {
            icon: "bg-blue-500 rounded-tr-full",
            title: "Expert Diagnostic Assistant",
            description:
              "Troubleshoot equipment issues using maintenance logs, failure analyses, and expertise.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Regulatory Compliance Engine",
            description:
              "Generate compliance documentation using quality systems, audits, and regulatory databases.",
          },
          {
            icon: "bg-green-500",
            title: "Safety & Technical Documentation Intelligence",
            description:
              "Search P&IDs, manuals, and safety procedures while identifying appropriate processes.",
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
              "Create training materials using safety procedures, equipment knowledge, and conversations.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Engineering Review Documentation",
            description:
              "Structure project updates from meeting notes, discussions, and design reviews.",
          },
          {
            icon: "bg-sky-400",
            title: "Policy & Compliance Intelligence Assistant",
            description:
              "Answer operational questions using quality manuals, EHS guidelines, and finance standards.",
          },
          {
            icon: "bg-green-500 rounded-tr-full",
            title: "Technical Knowledge Transfer",
            description:
              "Preserve expertise by capturing insights from technical conversations and documentation.",
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
              "Create datasheets and guides using product specifications, test data, and expertise.",
          },
          {
            icon: "bg-purple-500 rounded-tl-full",
            title: "Market Intelligence Platform",
            description:
              "Analyze competitive positioning using market research, customer feedback, and sales intelligence.",
          },
          {
            icon: "bg-blue-500 rounded-tr-full",
            title: "Product Portfolio Intelligence",
            description:
              "Develop technical content connecting R&D insights, customer requirements, and application knowledge.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Supplier Intelligence Hub",
            description:
              "Evaluate vendors using procurement data, supplier assessments, and supply chain expertise.",
          },
        ],
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
