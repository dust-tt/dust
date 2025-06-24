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
    title: "Build AI-powered investment workflows",
    description:
      "Deploy specialized AI agents that transform investment workflows, from deal sourcing to portfolio management, helping firms unlock institutional intelligence and make data-driven investment decisions with greater speed and precision.",
    bgColor: "bg-gray-50",
  },
  trustedBy: {
    title: "Trusted by investment leaders",
    logoSet: "default",
  },
  painPoints: {
    title: "Transform how you work",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Unlock Your Investment Intelligence",
        description:
          "Transform years of deal data, pitch decks, and market research into conversational intelligence. Access comprehensive investment history, relationship networks, and market insights through natural language queries, turning your data goldmine into instant competitive advantage.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Accelerate Market Research & Due Diligence",
        description:
          "Automate comprehensive market analysis and competitive intelligence gathering. Generate bespoke market insights, identify similar companies from historical data, and produce detailed due diligence reports in minutes instead of days, enabling faster, more informed investment decisions.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Streamline Investment Documentation",
        description:
          "Automate investment memo creation, portfolio updates, and LP reporting with AI-powered document generation. Combine template structures with deal data and market analysis to produce consistent, comprehensive documentation, freeing partners to focus on high-value investment activities.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in Action",
    useCases: [
      {
        title: "Target identification & research",
        image: "/static/landing/industry/features/target_research.svg",
        bgColor: "bg-gray-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Sector research",
            description:
              "Research companies operating in specific sectors, including recent funding activity and market positioning",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "Target intelligence",
            description:
              "Get snapshots of recent discussions and interactions with potential targets",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Meeting preparation",
            description:
              "Prepare notes for initial meetings with targets, analyzing past context and interactions",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Industry news",
            description:
              "Monitor industry trends and developments by pulling insights from newsletters, reports, and market intelligence",
          },
        ],
      },
      {
        title: "Due diligence",
        image: "/static/landing/industry/features/due_diligence.svg",
        bgColor: "bg-golden-100",
        features: [
          {
            icon: "bg-red-500",
            title: "Investment memo writing",
            description:
              "Write comprehensive investment memos summarizing findings, risks, and opportunities",
          },
          {
            icon: "bg-golden-400 rounded-tr-full",
            title: "Deal assessment",
            description:
              "Screen dealflow, evaluate pitch decks, and filter startups matching your investment thesis",
          },
          {
            icon: "bg-blue-500 rounded-bl-full",
            title: "Document analysis",
            description:
              "Summarize legal documents and extract key insights from due diligence materials",
          },
        ],
      },
      {
        title: "Portfolio support",
        image: "/static/landing/industry/features/portfolio_support.svg",
        bgColor: "bg-gray-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Board preparation",
            description: "Prepare materials and briefings for board meetings",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "Network intelligence",
            description:
              "Identify key contacts from your network who can provide expertise to portfolio companies",
          },
          {
            icon: "bg-green-400 rounded-bl-full",
            title: "Portfolio monitoring",
            description:
              "Track news and developments related to your portfolio companies",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Board minutes",
            description:
              "Create meeting minutes from transcripts with key decisions and action points",
          },
        ],
      },
      {
        title: "Reporting & content",
        image: "/static/landing/industry/features/reporting_content.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-red-500",
            title: "LP communications",
            description: "Generate reports for Limited Partners",
          },
          {
            icon: "bg-golden-400 rounded-tr-full",
            title: "Marketing & social",
            description:
              "Generate content for public audiences including case studies, LinkedIn posts, and thought leadership pieces",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Compliance support",
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
