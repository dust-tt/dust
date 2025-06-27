import { BookOpenIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import { createLayoutConfig } from "@app/components/home/content/Industry/configs/utils";

export const mediaConfig: IndustryPageConfig = {
  layout: createLayoutConfig([
    "hero",
    "painPoints",
    "dustInAction",
    "customerStories",
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
      src: "/static/landing/industry/Dust_Connectors.svg",
      alt: "Media Companies AI-powered workflows illustration",
    },
  },
  painPoints: {
    title: "3 Pain points Dust solves",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Editorial & Content Production Pressure",
        description:
          "Meeting tight deadlines while maintaining quality content across multiple channels and formats becomes increasingly challenging.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Audience Management & Personalization Improvement",
        description:
          "Understanding and engaging diverse audience segments while delivering personalized content experiences at scale.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Audience Engagement & Revenue Optimization",
        description:
          "Maximizing audience retention and monetization while adapting to changing consumption patterns and market dynamics.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in Action",
    useCases: [
      {
        title: "Editorial & Newsroom Operations",
        image: "/static/landing/industry/features/Radar_pressdigest.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Story Research & Briefings",
            description:
              "Automatically gather background information, sources, and context for breaking news and feature stories.",
          },
          {
            icon: "bg-purple-500 rounded-tl-full",
            title: "Content Planning & Coordination",
            description:
              "Optimize editorial calendars, manage assignments, and coordinate multi-platform publishing.",
          },
          {
            icon: "bg-green-500 rounded-tr-full",
            title: "Fact-Checking & Verification",
            description:
              "Accelerate fact-checking processes with AI-assisted source verification and information validation.",
          },
          {
            icon: "bg-yellow-400",
            title: "SEO & Headlines Optimization",
            description:
              "Generate compelling headlines and optimize content for search engines and social media platforms.",
          },
          {
            icon: "bg-red-500 rounded-bl-full",
            title: "Interview Preparation",
            description:
              "Compile comprehensive briefings, background research, and strategic questions for interviews.",
          },
        ],
      },
      {
        title: "Audience & Engagement",
        image: "/static/landing/industry/features/Social_post.svg",
        bgColor: "bg-pink-100",
        features: [
          {
            icon: "bg-pink-500",
            title: "Content Performance Analytics",
            description:
              "Track engagement metrics across platforms and identify top-performing content patterns.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Audience Segmentation Analysis",
            description:
              "Understand reader preferences, demographics, and consumption behaviors for targeted content.",
          },
          {
            icon: "bg-purple-500 rounded-tr-full",
            title: "Social Media Strategy",
            description:
              "Optimize social media presence with data-driven content strategies and engagement tactics.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Newsletter & Email Campaigns",
            description:
              "Create personalized email content and optimize newsletter performance with audience insights.",
          },
          {
            icon: "bg-yellow-400 rounded-br-full",
            title: "Community Management",
            description:
              "Monitor and respond to audience feedback, comments, and engagement across all channels.",
          },
        ],
      },
      {
        title: "Strategic Intelligence",
        image: "/static/landing/industry/features/Radar_AIDigest.svg",
        bgColor: "bg-gray-900",
        features: [
          {
            icon: "bg-gray-300",
            title: "Competitive Coverage Analysis",
            description:
              "Monitor competitor content strategies, performance metrics, and market positioning.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Opportunity Trend Identification",
            description:
              "Identify emerging topics, trending stories, and content opportunities before competitors.",
          },
          {
            icon: "bg-purple-500 rounded-tr-full",
            title: "Revenue Forecasting & Strategy",
            description:
              "Analyze revenue trends, subscription patterns, and monetization opportunities.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Market Trend Monitoring",
            description:
              "Track industry developments, regulatory changes, and technological advancements affecting media landscape.",
          },
        ],
      },
      {
        title: "Legal & Business Affairs",
        image:
          "/static/landing/industry/features/Compliance_verification_2.svg",
        bgColor: "bg-yellow-100",
        features: [
          {
            icon: "bg-yellow-500",
            title: "Rights Management & Licensing",
            description:
              "Track content usage rights, licensing agreements, and copyright compliance across all platforms.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Regulatory Compliance Monitoring",
            description:
              "Stay updated on media regulations, privacy laws, and industry standards affecting content publication.",
          },
          {
            icon: "bg-purple-500 rounded-tr-full",
            title: "Contract Analysis & Management",
            description:
              "Streamline contract reviews, vendor agreements, and talent contracts with AI-assisted analysis.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Compliance Documentation",
            description:
              "Maintain comprehensive records for legal compliance, audit trails, and regulatory reporting requirements.",
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
