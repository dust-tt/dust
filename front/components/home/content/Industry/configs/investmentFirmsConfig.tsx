import { ActionBriefcaseIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";

export const investmentFirmsConfig: IndustryPageConfig = {
  hero: {
    chip: {
      label: "Investment Firms",
      color: "blue",
      icon: ActionBriefcaseIcon,
    },
    title: (
      <>
        Dust for
        <br /> Investment Firms
      </>
    ),
    description:
      "Transform investment operations with AI-powered solutions that streamline due diligence, enhance portfolio management, and optimize research workflows for superior investment outcomes.",
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
    testimonialCard: {
      quote:
        "Dust's Flamel API integration and multi-model flexibility was crucial. Not everything is in Notion or Drive - connecting to our databases was key.",
      author: {
        name: "Stanislas Lot",
        title: "Partner",
      },
      company: {
        logo: "/static/landing/logos/color/daphni.png",
        alt: "Daphni",
      },
      bgColor: "bg-blue-600",
      textColor: "text-white",
    },
      decorativeShapes: {
      topRight: "/static/landing/industry/shapes/rounded-rectangle.svg",
      bottomLeft: "/static/landing/industry/shapes/diamond.svg",
    },
  },
  aiAgents: {
    title: "3 Pain points Dust solves",
    description:
      "Deploy specialized AI agents that transform investment workflows, from target identification to portfolio management, helping firms make data-driven investment decisions with greater efficiency.",
    bgColor: "bg-gray-50",
  },
  trustedBy: {
    title: "Trusted by investment leaders",
    logoSet: "default",
  },
  painPoints: {
    title: "3 Pain points Dust solves",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Operational Costs: Inefficient Knowledge Transfer",
        description:
          "Repeated errors and rework plague distributed teams due to siloed expertise. Critical institutional knowledge disappears with staff turnover, while inconsistent processes slow project execution, inflating operational costs across development and maintenance cycles.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Customer Retention: Fragmented Information Access",
        description:
          "Frontline teams waste critical time hunting across disconnected systems rather than resolving issues. Delays in diagnosing infrastructure problems and inconsistent service resolution threaten customer trust.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Revenue Leakage: Manual Compliance Workflows",
        description:
          "Manual review of contracts, permits, and regulatory documents delays project starts. Legal bottlenecks and reactive compliance monitoring extend time-to-revenue for new projects.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in Action",
    useCases: [
      {
        title: "Target Identification & Research",
        image: "/static/landing/industry/features/target_research.svg",
        bgColor: "bg-gray-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Sector Research",
            description:
              "Research companies operating in specific sectors, including recent funding activity and market positioning",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "Target Intelligence",
            description:
              "Get snapshots of recent discussions and interactions with potential targets",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Meeting Preparation",
            description:
              "Prepare notes for initial meetings with targets, analyzing past context and interactions",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Industry News",
            description:
              "Monitor industry trends and developments by pulling insights from newsletters, reports, and market intelligence",
          },
        ],
      },
      {
        title: "Due Diligence",
        image: "/static/landing/industry/features/due_diligence.svg",
        bgColor: "bg-golden-100",
        features: [
          {
            icon: "bg-red-500",
            title: "Investment Memo Writing",
            description:
              "Write comprehensive investment memos summarizing findings, risks, and opportunities",
          },
          {
            icon: "bg-golden-400 rounded-tr-full",
            title: "Deal Assessment",
            description:
              "Screen dealflow, evaluate pitch decks, and filter startups matching your investment thesis",
          },
          {
            icon: "bg-blue-500 rounded-bl-full",
            title: "Document Analysis",
            description:
              "Summarize legal documents and extract key insights from due diligence materials",
          },
        ],
      },
      {
        title: "Portfolio Support",
        image: "/static/landing/industry/features/portfolio_support.svg",
        bgColor: "bg-gray-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Board Preparation",
            description:
              "Prepare materials and briefings for board meetings",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "Network Intelligence",
            description:
              "Identify key contacts from your network who can provide expertise to portfolio companies",
          },
          {
            icon: "bg-green-400 rounded-bl-full",
            title: "Portfolio Monitoring",
            description:
              "Track news and developments related to your portfolio companies",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Board Minutes",
            description:
              "Create meeting minutes from transcripts with key decisions and action points",
          },
        ],
      },
      {
        title: "Reporting & Content",
        image: "/static/landing/industry/features/reporting_content.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-red-500",
            title: "LP Communications",
            description:
              "Generate reports for Limited Partners",
          },
          {
            icon: "bg-golden-400 rounded-tr-full",
            title: "Marketing & Social",
            description:
              "Generate content for public audiences including case studies, LinkedIn posts, and thought leadership pieces",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Compliance Support",
            description:
              "Handle ESG questionnaires and ensure regulatory compliance across reporting",
          },
        ],
      },
    ],
  },
  impactMetrics: {
    bgColor: "bg-blue-50",
    metrics: [
      {
        value: "70",
        unit: "%",
        type: "Faster",
        description: "due diligence and research processes",
      },
      {
        value: "85",
        unit: "%",
        type: "Improvement",
        description: "in portfolio monitoring and reporting efficiency",
      },
      {
        value: "60",
        unit: "%",
        type: "Reduction",
        description: "in operational costs and manual workflows",
      },
    ],
  },
  demoVideo: {
    sectionTitle: "See Dust transform investment operations",
    videoUrl: "https://fast.wistia.net/embed/iframe/8q80neektv",
  },
  testimonial: {
    quote:
      "Dust is the most impactful software we've adopted since building Clay.",
    author: {
      name: "Everett Berry",
      title: "Head of GTM Engineering at Clay",
    },
    company: {
      logo: "/static/landing/logos/color/clay_white.png",
      alt: "Clay logo",
    },
    bgColor: "bg-green-600",
    textColor: "text-white",
  },
  customerStories: {
    title: "Customer stories",
    stories: [
      {
        title: "How Daphni Unlocks 9 Years of VC Intelligence with AI",
        content:
          "European VC firm Daphni transformed their 12 million data points across 85,000 companies into instant, actionable intelligence by adding Dust AI agents to their proprietary Flamel platform, revolutionizing deal sourcing and investment decision-making.",
        href: "TO INSERT",
        src: "TO INSERT",
      },
      // {
      //   title:
      //     "20%+ productivity gains in Sales: Insights from Alan and Payfit",
      //   content:
      //     "Leading companies share how Dust agents deliver significant productivity improvements and measurable ROI in sales operations.",
      //   href: "https://blog.dust.tt/generative-ai-insights-alan-payfit-leaders/",
      //   src: "https://blog.dust.tt/content/images/size/w2000/2025/01/Founder.jpg",
      // },
      // {
      //   title:
      //     "50% Time Savings: How Didomi Transformed Privacy Compliance with AI",
      //   content:
      //     "Didomi's legal team cuts workload by 50% using Dust's AI assistants for privacy compliance and legal document management.",
      //   href: "https://blog.dust.tt/how-thomas-uses-ai-assistants-to-manage-legal-and-data-privacy-at-didomi/",
      //   src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_didomi.png",
      // },
    ],
  },
  justUseDust: {
    title: "Just use Dust",
    titleColor: "text-blue-600",
    ctaButtons: {
      primary: {
        label: "Start Free Trial",
        href: "/api/auth/login",
      },
      secondary: {
        label: "Contact Sales",
        href: "/home/contact",
      },
    },
    bgColor: "bg-blue-50",
    decorativeShapes: true,
  },
};