import { BarChartIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import { createLayoutConfig } from "@app/components/home/content/Industry/configs/utils";

export const investmentConfig: IndustryPageConfig = {
  layout: createLayoutConfig([
    "hero",
    "painPoints",
    "dustInAction",
    "customerStories",
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
      src: "/static/landing/industry/Dust_Connectors.svg",
      alt: "Investment Firms AI-powered workflows illustration",
    },
  },
  painPoints: {
    title: "3 Pain points Dust solves",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Operational Costs: Optimization and Knowledge Transfer",
        description:
          "Reduce operational overhead through automated research processes and efficient knowledge management across investment teams.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Customer Retention: Engagement and Data Access",
        description:
          "Enhance client relationships through timely insights, personalized reporting, and improved access to investment data and analysis.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Revenue Leakage: Inefficient Manual Workflows",
        description:
          "Eliminate revenue loss from missed opportunities, delayed decision-making, and inefficient manual processes in investment workflows.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in Action",
    useCases: [
      {
        title: "Target Identification & Research",
        image: "/static/landing/industry/features/Search_assistant.svg",
        bgColor: "bg-pink-100",
        features: [
          {
            icon: "bg-pink-500",
            title: "Sales Research",
            description:
              "Identify high-potential investment targets through comprehensive market and company analysis.",
          },
          {
            icon: "bg-purple-500 rounded-tl-full",
            title: "Target Intelligence",
            description:
              "Gather detailed intelligence on potential acquisition targets and competitive landscape analysis.",
          },
          {
            icon: "bg-blue-500 rounded-tr-full",
            title: "Market Analysis",
            description:
              "Analyze market trends, sector dynamics, and investment opportunities with real-time data insights.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Pipeline Management",
            description:
              "Streamline deal pipeline management with automated tracking and prioritization of investment opportunities.",
          },
          {
            icon: "bg-yellow-400 rounded-br-full",
            title: "Competitive Intelligence",
            description:
              "Monitor competitor activities, market positioning, and strategic moves in target sectors.",
          },
        ],
      },
      {
        title: "Due Diligence",
        image: "/static/landing/industry/features/Doc_analysis.svg",
        bgColor: "bg-yellow-100",
        features: [
          {
            icon: "bg-yellow-500",
            title: "Investment History & DD",
            description:
              "Comprehensive analysis of investment history, financial performance, and risk assessment.",
          },
          {
            icon: "bg-purple-500 rounded-tl-full",
            title: "ESG Assessments",
            description:
              "Evaluate environmental, social, and governance factors for sustainable investment decisions.",
          },
          {
            icon: "bg-blue-500 rounded-tr-full",
            title: "Financial Analysis",
            description:
              "Deep financial modeling, valuation analysis, and performance benchmarking against industry standards.",
          },
        ],
      },
      {
        title: "Portfolio Support",
        image: "/static/landing/industry/features/Radar_partner.svg",
        bgColor: "bg-gray-100",
        features: [
          {
            icon: "bg-gray-600",
            title: "Board Preparation",
            description:
              "Automate board meeting prep with comprehensive portfolio updates and strategic recommendations.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Performance Monitoring",
            description:
              "Track portfolio company performance with real-time metrics and automated reporting dashboards.",
          },
          {
            icon: "bg-green-500 rounded-tr-full",
            title: "Value Creation",
            description:
              "Identify value creation opportunities and operational improvements across portfolio companies.",
          },
          {
            icon: "bg-purple-500 rounded-bl-full",
            title: "Exit Planning",
            description:
              "Strategic exit planning support with market timing analysis and buyer identification.",
          },
        ],
      },
      {
        title: "Reporting & Content",
        image: "/static/landing/industry/features/Document_generation.svg",
        bgColor: "bg-orange-100",
        features: [
          {
            icon: "bg-orange-500",
            title: "LP Portfolio Reporting",
            description:
              "Generate comprehensive limited partner reports with portfolio performance and market insights.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Marketing & Social",
            description:
              "Create compelling marketing materials and maintain thought leadership through strategic content.",
          },
          {
            icon: "bg-purple-500 rounded-tr-full",
            title: "Compliance Support",
            description:
              "Ensure regulatory compliance with automated documentation and reporting requirements.",
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
