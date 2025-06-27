import { SparklesIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import { createLayoutConfig } from "@app/components/home/content/Industry/configs/utils";

export const energyConfig: IndustryPageConfig = {
  layout: createLayoutConfig([
    "hero",
    "painPoints",
    "dustInAction",
    "customerStories",
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
      src: "/static/landing/industry/Dust_Connectors.webp",
      alt: "Energy & Utilities AI-powered automation illustration",
    },
  },

  painPoints: {
    title: "3 pain points Dust solves",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Operational costs",
        description:
          "Optimize maintenance schedules and predict equipment failures, reducing downtime and operational expenses while maximizing efficiency.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Customer penetration",
        description:
          "Enhance customer acquisition and retention through personalized energy solutions and proactive service delivery.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Revenue leakage",
        description:
          "Identify billing discrepancies, optimize pricing strategies, and ensure accurate meter readings to maximize revenue capture.",
        color: "green",
      },
    ],
  },

  dustInAction: {
    title: "Dust in Action",
    useCases: [
      {
        title: "Commercial operations",
        image: "/static/landing/industry/features/Radar_pressdigest.webp",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-red-500",
            title: "Documentation and process efficiency",
            description:
              "Automate regulatory compliance documentation and streamline operational processes across multiple facilities and jurisdictions.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Energy market analysis",
            description:
              "Monitor energy markets, analyze pricing trends, and optimize procurement strategies for maximum cost efficiency.",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Regulatory compliance automation",
            description:
              "Ensure adherence to environmental regulations and safety standards through automated monitoring and reporting.",
          },
          {
            icon: "bg-green-500",
            title: "Contract and vendor management",
            description:
              "Streamline supplier relationships, manage service agreements, and optimize vendor performance across operations.",
          },
        ],
      },
      {
        title: "Customer service operations",
        image: "/static/landing/industry/features/Social_post.webp",
        bgColor: "bg-pink-100",
        features: [
          {
            icon: "bg-green-500",
            title: "Billing disputes and customer services",
            description:
              "Resolve billing inquiries quickly and accurately while providing personalized energy usage insights to customers.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Outage management and communication",
            description:
              "Coordinate outage responses, communicate proactively with affected customers, and manage restoration priorities.",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Energy efficiency recommendations",
            description:
              "Provide tailored energy saving recommendations based on usage patterns and customer preferences.",
          },
        ],
      },
      {
        title: "Field operations",
        image: "/static/landing/industry/features/Radar_AIDigest.webp",
        bgColor: "bg-gray-950",
        features: [
          {
            icon: "bg-blue-500",
            title: "Predictive maintenance alerts",
            description:
              "Anticipate equipment failures and schedule maintenance proactively to minimize downtime and reduce costs.",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "Safety protocol automation",
            description:
              "Ensure compliance with safety procedures and automate incident reporting for improved workplace safety.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Asset management and documentation",
            description:
              "Track equipment lifecycle, manage inventory, and maintain comprehensive asset documentation.",
          },
        ],
      },
      {
        title: "Project management & strategic operations",
        image:
          "/static/landing/industry/features/Compliance_verification_2.webp",
        bgColor: "bg-golden-100",
        features: [
          {
            icon: "bg-purple-500",
            title: "Planning, execution, and decision intelligence",
            description:
              "Optimize project timelines, resource allocation, and strategic decision-making with data-driven insights.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Project coordination",
            description:
              "Streamline cross-functional collaboration and ensure projects stay on schedule and within budget.",
          },
          {
            icon: "bg-green-500 rounded-br-full",
            title: "Strategic planning",
            description:
              "Support long-term planning initiatives with comprehensive market analysis and operational intelligence.",
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
    title: "Just use Dust",
    titleColor: "text-blue-600",
    ctaButtons: {
      primary: {
        label: "Start free trial",
        href: "/api/auth/login",
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
