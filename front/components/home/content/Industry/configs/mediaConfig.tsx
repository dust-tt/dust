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
      "Transform media operations with AI-powered solutions that streamline editorial workflows, enhance audience engagement, and optimize content strategy across all platforms.",
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
    title: "3 Pain points Dust solves",
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
        title: "Editorial & Content Production Process",
        description:
          "Streamline editorial workflows, content creation, and newsroom operations to produce high-quality content faster while maintaining editorial standards and accuracy.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Audience Management & Knowledge Retrieval",
        description:
          "Leverage AI to understand audience preferences, retrieve relevant information quickly, and manage content distribution across multiple platforms effectively.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Audience Engagement & Revenue Optimization",
        description:
          "Optimize content strategy, enhance audience engagement, and maximize revenue through data-driven insights and personalized content recommendations.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in Action",
    useCases: [
      {
        title: "Editorial & Newsroom Operations",
        image: "/static/landing/industry/features/editorial_newsroom.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Content Creation and Newsroom Efficiency",
            description:
              "AI-powered content generation, fact-checking, and editorial workflow automation",
          },
          {
            icon: "bg-green-500 rounded-tr-full",
            title: "Story Research & Briefings",
            description:
              "Automated research compilation and comprehensive story briefings for journalists",
          },
          {
            icon: "bg-orange-400 rounded-bl-full",
            title: "Real-time News Updates & Summary",
            description:
              "Instant news summarization and real-time updates across multiple sources",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Fact Checking Operations",
            description:
              "Automated fact verification and source validation for editorial accuracy",
          },
          {
            icon: "bg-red-500",
            title: "Breaking News Response",
            description:
              "Rapid response systems for breaking news coverage and distribution",
          },
          {
            icon: "bg-cyan-400",
            title: "Content Formatting & Distribution",
            description:
              "Automated content formatting and multi-platform distribution workflows",
          },
        ],
      },
      {
        title: "Audience & Engagement",
        image: "/static/landing/industry/features/audience_engagement.svg",
        bgColor: "bg-gray-100",
        features: [
          {
            icon: "bg-red-500",
            title: "Content optimization and reader development",
            description:
              "AI-driven content optimization and strategic reader engagement programs",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Audience Segmentation Analytics",
            description:
              "Advanced audience analytics and behavioral segmentation for targeted content",
          },
          {
            icon: "bg-blue-500 rounded-bl-full",
            title: "Social Media Content Distribution",
            description:
              "Automated social media posting and cross-platform content distribution",
          },
          {
            icon: "bg-green-400 rounded-br-full",
            title: "Newsletter and Email Marketing",
            description:
              "Personalized newsletter creation and automated email marketing campaigns",
          },
        ],
      },
      {
        title: "Strategic Intelligence",
        image: "/static/landing/industry/features/strategic_intelligence.svg",
        bgColor: "bg-gray-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Competitive Coverage Analysis",
            description:
              "Monitor competitor strategies, analyze market trends, and track industry coverage",
          },
          {
            icon: "bg-red-500 rounded-tl-full",
            title: "Opportunity Trend Identification",
            description:
              "Identify emerging trends and content opportunities through data analysis",
          },
          {
            icon: "bg-green-400 rounded-br-full",
            title: "Reader Feedback Synthesis",
            description:
              "Aggregate and analyze reader feedback to inform editorial strategy and content planning",
          },
          {
            icon: "bg-purple-400",
            title: "Predictive Trend Monitoring",
            description:
              "AI-powered trend prediction and content performance forecasting",
          },
        ],
      },
      {
        title: "Legal & Business Affairs",
        image: "/static/landing/industry/features/legal_business.svg",
        bgColor: "bg-orange-100",
        features: [
          {
            icon: "bg-orange-500",
            title: "Rights management and compliance",
            description:
              "Automated rights management, licensing compliance, and legal document processing",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Contract Review and Management",
            description:
              "AI-powered contract analysis and vendor management for media operations",
          },
          {
            icon: "bg-red-400 rounded-br-full",
            title: "Compliance Documentation",
            description:
              "Automated compliance reporting and regulatory documentation for media standards",
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
