import { ActionFilmIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";

export const mediaConfig: IndustryPageConfig = {
  hero: {
    chip: {
      label: "Media",
      color: "blue",
      icon: ActionFilmIcon,
    },
    title: (
      <>
        Dust for
        <br /> Media Companies
      </>
    ),
    description:
      "The AI Solution Trusted by Leading SaaS Innovators—Say goodbye to scattered info, manual busywork, and buried insights.",
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
        "Dust is the most impactful software we've adopted since building Clay.",
      author: {
        name: "David Chen",
        title: "Editor-in-Chief",
      },
      company: {
        logo: "/static/landing/logos/color/placeholder.png",
        alt: "Media Company logo",
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
    title: "AI agents for media operations",
    description:
      "Deploy specialized AI agents that transform media workflows, from editorial production to audience engagement, helping media companies stay competitive in the digital landscape.",
    bgColor: "bg-gray-50",
  },
  trustedBy: {
    title: "Trusted by media leaders",
    logoSet: "default",
  },
  painPoints: {
    title: "3 Pain points Dust solves",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Editorial & Content Production Pressure",
        description:
          "Newsrooms face relentless deadlines with limited staff. Journalists waste time on routine information gathering rather than reporting and analysis.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Archive Management & Knowledge Retrieval",
        description:
          "Decades of articles and institutional knowledge are trapped in legacy systems. Finding relevant background information takes too long.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Audience Engagement & Revenue Optimization",
        description:
          "Media companies struggle to understand what content resonates, optimize for engagement, and make data-driven decisions about strategy.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in Action",
    useCases: [
      {
        title: "Editorial & newsroom operations",
        image: "/static/landing/industry/features/editorial_newsroom.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Content creation and newsroom efficiency",
            description:
              "Compile background information and relevant context from archives for breaking news and investigative pieces.",
          },
          {
            icon: "bg-green-500 rounded-tr-full",
            title: "Guest research & briefings",
            description:
              "Compile comprehensive guest profiles, talking points, and background information for hosts and producers.",
          },
          {
            icon: "bg-orange-400 rounded-bl-full",
            title: "Interview transcription & summary",
            description:
              "Convert recorded interviews into searchable transcripts and generate key quote summaries for journalists.",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Fact-checking support",
            description:
              "Cross-reference claims against reliable sources and previous reporting to accelerate verification processes.",
          },
          {
            icon: "bg-red-500",
            title: "Press release processing",
            description:
              "Intelligent filtering and summarization of press releases, flagging newsworthy items and story angles.",
          },
        ],
      },
      {
        title: "Audience & engagement",
        image: "/static/landing/industry/features/audience_engagement.svg",
        bgColor: "bg-gray-100",
        features: [
          {
            icon: "bg-red-500",
            title: "Content optimization and reader development",
            description:
              "Generate headline variations and analyze performance data to optimize click-through rates and engagement.",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Content performance analytics",
            description:
              "Track reader engagement patterns and content performance to inform editorial strategy decisions.",
          },
          {
            icon: "bg-blue-500 rounded-bl-full",
            title: "Social media content adaptation",
            description:
              "Transform long-form articles into social media posts and platform-specific content for distribution.",
          },
          {
            icon: "bg-green-400 rounded-br-full",
            title: "Newsletter generation",
            description:
              "Compile daily/weekly newsletters by selecting top stories and formatting for different subscriber segments.",
          },
        ],
      },
      {
        title: "Strategic intelligence",
        image: "/static/landing/industry/features/strategic_intelligence.svg",
        bgColor: "bg-gray-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Competitive coverage analysis",
            description:
              "Monitor competitor coverage, identify story gaps, and track market positioning across media outlets.",
          },
          {
            icon: "bg-red-500 rounded-tl-full",
            title: "Community trend identification",
            description:
              "Analyze local government records and community data to identify emerging story opportunities.",
          },
          {
            icon: "bg-green-400 rounded-br-full",
            title: "Reader feedback synthesis",
            description:
              "Compile and analyze reader comments and feedback to understand audience concerns and interests.",
          },
          {
            icon: "bg-purple-400",
            title: "Industry trend monitoring",
            description:
              "Track journalism industry developments and business model innovations affecting the media sector.",
          },
        ],
      },
      {
        title: "Legal & business affairs",
        image: "/static/landing/industry/features/legal_business.svg",
        bgColor: "bg-orange-100",
        features: [
          {
            icon: "bg-orange-500",
            title: "Rights management and compliance",
            description:
              "Track complex rights agreements, territorial restrictions, and licensing terms across content libraries.",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Contract analysis",
            description:
              "Compare terms across talent agreements and distribution deals to identify standard clauses.",
          },
          {
            icon: "bg-red-400 rounded-br-full",
            title: "Compliance documentation",
            description:
              "Generate regulatory filings, content ratings documentation, and territorial compliance reports.",
          },
        ],
      },
    ],
  },
  impactMetrics: {
    bgColor: "bg-blue-50",
    metrics: [
      {
        value: "60",
        unit: "%",
        type: "Faster",
        description: "content production and editorial workflows",
      },
      {
        value: "75",
        unit: "%",
        type: "Improvement",
        description: "in audience engagement and content reach",
      },
      {
        value: "50",
        unit: "%",
        type: "Reduction",
        description: "in research and fact-checking time",
      },
    ],
  },
  demoVideo: {
    sectionTitle: "See Dust transform media operations",
    videoUrl: "https://fast.wistia.net/embed/iframe/8q80neektv",
  },
  trustedBySecond: {
    title: "Trusted by media leaders",
    logoSet: "default",
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
