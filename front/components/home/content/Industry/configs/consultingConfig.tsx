import { BarChartIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import { createLayoutConfig } from "@app/components/home/content/Industry/configs/utils";

export const consultingConfig: IndustryPageConfig = {
  seo: {
    title: "Dust for Consulting Firms",
    description:
      "Empower your consultants to deliver more value—faster. Instantly access firm knowledge, automate research and reporting, and accelerate every client engagement with AI.",
  },
  layout: createLayoutConfig([
    "hero",
    "painPoints",
    "dustInAction",
    "justUseDust",
  ]),
  hero: {
    chip: {
      label: "Consulting Firms",
      color: "blue",
      icon: BarChartIcon,
    },
    title: (
      <>
        Dust for
        <br /> Consulting
        <br /> Firms
      </>
    ),
    description:
      "Empower your consultants to deliver more value—faster. Instantly access firm knowledge, automate research and reporting, and accelerate every client engagement with AI.",
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
      alt: "Consulting Firms AI-powered workflows illustration",
    },
  },
  painPoints: {
    title: "Transform how you work",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Break free from busywork",
        description:
          "Stop burning senior talent on research and slide-building. Let AI handle the grunt work so your best minds focus on strategy, client relationships, and breakthrough thinking.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Never start from scratch again",
        description:
          "Surface insights from every past project, expert call, and client engagement—transforming your firm's collective intelligence into an always-available strategic advantage.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Win more with less effort",
        description:
          "Generate compelling proposals, spot high-value opportunities, and deliver client-ready insights at machine speed while your competitors are still gathering data.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Top Use Cases for Consulting Firms",
    useCases: [
      {
        title: "Consulting Delivery Operations",
        image: "/static/landing/industry/features/Search_assistant.webp",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Knowledge Retrieval & Research",
            description:
              "Search internal/external knowledge, industry data, and client documentation for project insights.",
          },
          {
            icon: "bg-pink-400 rounded-tr-full",
            title: "Report & Presentation Generation",
            description:
              "Auto-draft executive summaries, strategic reports, and client presentations.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Data Analysis Assistant",
            description:
              "Analyze client-level data, build SQL queries, Excel formulas, and generate data-driven recommendations.",
          },
          {
            icon: "bg-yellow-400 rounded-br-full",
            title: "Documentation & CRM Management",
            description:
              "Auto-populate CRM, sanitize client files for archiving, and structure project documentation.",
          },
        ],
      },
      {
        title: "Commercial Support",
        image: "/static/landing/industry/features/Sales_agent.webp",
        bgColor: "bg-rose-100",
        features: [
          {
            icon: "bg-red-500 rounded-br-full",
            title: "RFP & Proposal Response",
            description:
              "Craft tailored RFP/proposal responses using internal best practices.",
          },
          {
            icon: "bg-purple-500 rounded-tl-full",
            title: "Proposal Qualification",
            description:
              "AI-driven assessment of project quality and conversion likelihood.",
          },
          {
            icon: "bg-blue-500 rounded-tr-full",
            title: "CXO Meeting Preparation & Follow-ups",
            description:
              "Compile CXO-ready briefing packs with client + industry insights.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Prospect Outreach & Communication",
            description:
              "Generate targeted outreach emails, meeting follow-ups, and social posts for prospects.",
          },
          {
            icon: "bg-pink-400",
            title: "Workforce Planning",
            description:
              "Identify best people for RFPs based on skills and former project experience.",
          },
        ],
      },
      {
        title: "Internal Operations & Compliance",
        image: "/static/landing/industry/features/Doc_analysis_2.webp",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-gray-600 rounded-tl-full",
            title: "Internal Policy & Compliance Support",
            description:
              "Answer policy, HR, governance & compliance questions on demand.",
          },
          {
            icon: "bg-blue-500 rounded-tr-full",
            title: "Project Insights & Post-Mortem Analyzer",
            description:
              "Extract project lessons learned; drive post-mortem analyses.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Financial Support",
            description:
              "Automate financial reports, client payment reminders & compliance tasks.",
          },
        ],
      },
      {
        title: "Marketing & Intelligence",
        image: "/static/landing/industry/features/Social_post.webp",
        bgColor: "bg-orange-100",
        features: [
          {
            icon: "bg-red-500 rounded-br-full",
            title: "Content Creation & Optimization",
            description:
              "Write LinkedIn/blog posts aligned with brand guidelines.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Strategic Project Insights",
            description:
              "Generate strategic insights and analysis from internal project data.",
          },
          {
            icon: "bg-sky-400",
            title: "Industry Intelligence",
            description:
              "Develop industry radars and competitive landscape reports.",
          },
          {
            icon: "bg-green-500 rounded-tr-full",
            title: "Competitive Intelligence",
            description:
              "Monitor competitor activities, market positioning, and win/loss analysis.",
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
        href: "/customers/clay-scaling-gtme-team",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/06/clay_dust_agents.jpg",
      },
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
