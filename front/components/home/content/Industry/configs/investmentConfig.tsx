import { BarChartIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import { createLayoutConfig } from "@app/components/home/content/Industry/configs/utils";

export const investmentConfig: IndustryPageConfig = {
  seo: {
    title: "Dust for Investment Firms",
    description:
      "Accelerate research, enhance due diligence, and streamline operations with AI-powered workflows designed for investment professionals.",
  },
  layout: createLayoutConfig([
    "hero",
    "painPoints",
    "dustInAction",
    "justUseDust",
  ]),
  hero: {
    chip: {
      label: "Investment Firms",
      color: "blue",
      icon: BarChartIcon,
    },
    title: (
      <>
        Dust for
        <br /> Investment
        <br /> Firms
      </>
    ),
    description:
      "Accelerate research, enhance due diligence, and streamline operations with AI-powered workflows designed for investment professionals.",
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
      src: "/static/landing/industry/Dust_Connectors.webp",
      alt: "Investment Firms AI-powered workflows illustration",
    },
  },
  painPoints: {
    title: "Transform how you work",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Deal sourcing excellence: accelerated target identification",
        description:
          "Transform deal sourcing with intelligent market scanning and automated target research. Turn scattered industry data into comprehensive investment opportunities with instant competitive intelligence.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Due diligence speed: comprehensive analysis at scale",
        description:
          "Accelerate due diligence processes with automated document analysis and risk assessment. Transform weeks of manual review into rapid, thorough evaluations with consistent quality.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Portfolio optimization: data-driven value creation",
        description:
          "Maximize portfolio performance with real-time monitoring and strategic insights. Convert complex data across investments into actionable recommendations for sustainable growth.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in action",
    useCases: [
      {
        title: "Target Identification & Research",
        image: "/static/landing/industry/features/Search_assistant.webp",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Sector Research",
            description:
              "Research companies operating in specific sectors, including recent funding activity and market positioning.",
          },
          {
            icon: "bg-pink-400 rounded-tr-full",
            title: "Target Intelligence",
            description:
              "Get snapshots of recent discussions and interactions with potential targets.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Meeting Preparation",
            description:
              "Prepare notes for initial meetings with targets, analyzing past context and interactions.",
          },
          {
            icon: "bg-yellow-400 rounded-br-full",
            title: "Industry News",
            description:
              "Monitor industry trends and developments by pulling insights from newsletters, reports, and market intelligence.",
          },
        ],
      },
      {
        title: "Due Diligence",
        image: "/static/landing/industry/features/Doc_analysis_2.webp",
        bgColor: "bg-rose-100",
        features: [
          {
            icon: "bg-red-500 rounded-br-full",
            title: "Investment Memo Writing",
            description:
              "Write comprehensive investment memos summarizing findings, risks, and opportunities.",
          },
          {
            icon: "bg-purple-500 rounded-tl-full",
            title: "Deal Assessment",
            description:
              "Screen dealflow, evaluate pitch decks, and filter startups matching your investment thesis.",
          },
          {
            icon: "bg-blue-500 rounded-tr-full",
            title: "Document Analysis",
            description:
              "Summarize legal documents and extract key insights from due diligence materials.",
          },
        ],
      },
      {
        title: "Portfolio Support",
        image: "/static/landing/industry/features/Radar_partner.webp",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-gray-600 rounded-tl-full",
            title: "Board Preparation",
            description: "Prepare materials and briefings for board meetings.",
          },
          {
            icon: "bg-blue-500 rounded-tr-full",
            title: "Network Intelligence",
            description:
              "Identify key contacts from your network who can provide expertise to portfolio companies.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Portfolio Monitoring",
            description:
              "Track news and developments related to your portfolio companies.",
          },
          {
            icon: "bg-green-500",
            title: "Board Minutes",
            description:
              "Create meeting minutes from transcripts with key decisions and action points.",
          },
        ],
      },
      {
        title: "Reporting & Content",
        image: "/static/landing/industry/features/Quarterly_update.webp",
        bgColor: "bg-orange-100",
        features: [
          {
            icon: "bg-red-500 rounded-br-full",
            title: "LP Communications",
            description: "Generate reports for Limited Partners.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Marketing & Social",
            description:
              "Generate content for public audiences including case studies, LinkedIn posts, and thought leadership pieces.",
          },
          {
            icon: "bg-sky-400",
            title: "Compliance Support",
            description:
              "Handle ESG questionnaires and ensure regulatory compliance across reporting.",
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
