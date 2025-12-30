import { BookOpenIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import { createLayoutConfig } from "@app/components/home/content/Industry/configs/utils";

export const mediaConfig: IndustryPageConfig = {
  seo: {
    title: "Dust for Media Companies",
    description:
      "Accelerate content creation, improve audience engagement, and streamline operations with AI-powered workflows.",
  },
  layout: createLayoutConfig([
    "hero",
    "painPoints",
    "dustInAction",
    "justUseDust",
  ]),
  hero: {
    chip: {
      label: "Media Companies",
      color: "blue",
      icon: BookOpenIcon,
    },
    title: (
      <>
        Dust for
        <br /> Media
        <br /> Companies
      </>
    ),
    description:
      "Accelerate content creation, improve audience engagement, and streamline operations with AI-powered workflows.",
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
      alt: "Media Companies AI-powered workflows illustration",
    },
  },
  painPoints: {
    title: "Transform how you work",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Content excellence: accelerated production workflows",
        description:
          "Streamline editorial processes and boost content quality across multiple channels. Transform tight deadlines into competitive advantages with intelligent production workflows.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Audience intelligence: smart personalization at scale",
        description:
          "Unlock deeper audience insights and deliver precisely targeted content experiences. Turn diverse audience segments into engaged communities through intelligent personalization.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Revenue growth: optimized engagement & monetization",
        description:
          "Maximize audience retention and revenue potential by adapting instantly to consumption patterns. Convert changing market dynamics into sustainable growth opportunities.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in action",
    useCases: [
      {
        title: "Editorial & newsroom operations",
        image: "/static/landing/industry/features/Radar_pressdigest.webp",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Story research & briefings",
            description:
              "Automatically gather background information, sources, and context for breaking news and feature stories.",
          },
          {
            icon: "bg-purple-500 rounded-tl-full",
            title: "Content planning & coordination",
            description:
              "Optimize editorial calendars, manage assignments, and coordinate multi-platform publishing.",
          },
          {
            icon: "bg-green-500 rounded-tr-full",
            title: "Fact-checking & verification",
            description:
              "Accelerate fact-checking processes with AI-assisted source verification and information validation.",
          },
          {
            icon: "bg-yellow-400",
            title: "SEO & headlines optimization",
            description:
              "Generate compelling headlines and optimize content for search engines and social media platforms.",
          },
          {
            icon: "bg-red-500 rounded-bl-full",
            title: "Interview preparation",
            description:
              "Compile comprehensive briefings, background research, and strategic questions for interviews.",
          },
        ],
      },
      {
        title: "Audience & engagement",
        image: "/static/landing/industry/features/Social_post.webp",
        bgColor: "bg-pink-100",
        features: [
          {
            icon: "bg-pink-500",
            title: "Content performance analytics",
            description:
              "Track engagement metrics across platforms and identify top-performing content patterns.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Audience segmentation analysis",
            description:
              "Understand reader preferences, demographics, and consumption behaviors for targeted content.",
          },
          {
            icon: "bg-purple-500 rounded-tr-full",
            title: "Social media strategy",
            description:
              "Optimize social media presence with data-driven content strategies and engagement tactics.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Newsletter & email campaigns",
            description:
              "Create personalized email content and optimize newsletter performance with audience insights.",
          },
          {
            icon: "bg-yellow-400 rounded-br-full",
            title: "Community management",
            description:
              "Monitor and respond to audience feedback, comments, and engagement across all channels.",
          },
        ],
      },
      {
        title: "Strategic intelligence",
        image: "/static/landing/industry/features/Radar_AIDigest.webp",
        bgColor: "bg-gray-900",
        features: [
          {
            icon: "bg-gray-300",
            title: "Competitive coverage analysis",
            description:
              "Monitor competitor content strategies, performance metrics, and market positioning.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Opportunity trend identification",
            description:
              "Identify emerging topics, trending stories, and content opportunities before competitors.",
          },
          {
            icon: "bg-purple-500 rounded-tr-full",
            title: "Revenue forecasting & strategy",
            description:
              "Analyze revenue trends, subscription patterns, and monetization opportunities.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Market trend monitoring",
            description:
              "Track industry developments, regulatory changes, and technological advancements affecting media landscape.",
          },
        ],
      },
      {
        title: "Legal & business affairs",
        image:
          "/static/landing/industry/features/Compliance_verification_2.webp",
        bgColor: "bg-yellow-100",
        features: [
          {
            icon: "bg-yellow-500",
            title: "Rights management & licensing",
            description:
              "Track content usage rights, licensing agreements, and copyright compliance across all platforms.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Regulatory compliance monitoring",
            description:
              "Stay updated on media regulations, privacy laws, and industry standards affecting content publication.",
          },
          {
            icon: "bg-purple-500 rounded-tr-full",
            title: "Contract analysis & management",
            description:
              "Streamline contract reviews, vendor agreements, and talent contracts with AI-assisted analysis.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Compliance documentation",
            description:
              "Maintain comprehensive records for legal compliance, audit trails, and regulatory reporting requirements.",
          },
        ],
      },
    ],
  },
  // customerStories: {
  //   title: "Customer stories",
  //   stories: [
  //     {
  //       title: "How Clay is powering 4x team growth with Dust",
  //       content:
  //         "Clay uses Dust AI agents to scale their GTM team 4x while maintaining sales velocity and achieving 100% adoption across their growing team.",
  //       href: "/customers/clay-scaling-gtme-team",
  //       src: "https://blog.dust.tt/content/images/size/w2000/2025/06/clay_dust_agents.jpg",
  //     },
  //     {
  //       title:
  //         "20%+ productivity gains in Sales: Insights from Alan and Payfit",
  //       content:
  //         "Leading companies share how Dust agents deliver significant productivity improvements and measurable ROI in sales operations.",
  //       href: "/customers/generative-ai-insights-alan-payfit-leaders",
  //       src: "https://blog.dust.tt/content/images/size/w2000/2025/01/Founder.jpg",
  //     },
  //     {
  //       title:
  //         "50% Time Savings: How Didomi Transformed Privacy Compliance with AI",
  //       content:
  //         "Didomi's legal team cuts workload by 50% using Dust's AI assistants for privacy compliance and legal document management.",
  //       href: "/customers/how-thomas-uses-ai-assistants-to-manage-legal-and-data-privacy-at-didomi",
  //       src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_didomi.png",
  //     },
  //     {
  //       title:
  //         "50,000 Hours Saved: How Qonto Revolutionized Compliance and Risk Assessment with AI",
  //       content:
  //         "Germi, Qonto's AI assistant, analyzes German industry codes and screens prohibited activities, automating compliance checks across European markets.",
  //       href: "/customers/qonto-dust-ai-partnership",
  //       src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Qonto-__-Dust.jpg",
  //     },
  //     {
  //       title: "Kyriba's adoption of Dust across all functions",
  //       content:
  //         "43% of Kyriba employees save more than 3 hours weekly leveraging Dust for RFPs.",
  //       href: "/customers/kyriba-accelerating-innovation-with-dust",
  //       src: "https://blog.dust.tt/content/images/size/w2000/2024/10/kyriba_dust.jpg",
  //     },
  //   ],
  // },
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
