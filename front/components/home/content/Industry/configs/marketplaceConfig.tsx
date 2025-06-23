import { ActionShoppingBasketIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";

export const marketplaceConfig: IndustryPageConfig = {
  hero: {
    chip: {
      label: "Marketplace",
      color: "blue",
      icon: ActionShoppingBasketIcon,
    },
    title: (
      <>
        Dust for
        <br /> B2B Marketplaces
      </>
    ),
    description:
      "Empower Your Marketplace Teams to Focus on Growth, Not Grunt Work. Automate operations, enhance seller success, and scale efficiently with AI.",
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
        "Dust has empowered our employees to work smarter, innovate, and push boundaries.",
      author: {
        name: "Matthieu Birach",
        title: "Chief People Officer at Doctolib",
      },
      company: {
        logo: "/static/landing/logos/color/doctolib.png",
        alt: "Doctolib logo",
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
    title: "Transform how you work",
    description:
      "Deploy AI agents that automate marketplace operations, enhance seller onboarding, and provide intelligent insights—freeing your team to focus on strategic growth and innovation.",
    bgColor: "bg-gray-50",
  },
  trustedBy: {
    title: "Trusted by marketplace leaders",
    logoSet: "default",
  },
  painPoints: {
    title: "Transform how you work",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Scale Operations",
        description:
          "Automate repetitive marketplace operations and seller management tasks to scale efficiently without proportional headcount growth.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Enhance Seller Success",
        description:
          "Provide personalized onboarding, automated support, and intelligent insights to help sellers succeed on your platform.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Optimize Performance",
        description:
          "Leverage AI-powered analytics and automation to optimize marketplace operations and drive sustainable growth.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in Action",
    useCases: [
      {
        title: "Supply Growth",
        image: "/static/landing/industry/features/GTM_Ops.svg",
        bgColor: "bg-orange-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Automated Seller Outreach",
            description:
              "AI-powered prospecting and outreach to identify and engage high-quality sellers",
          },
          {
            icon: "bg-orange-400 rounded-tr-full",
            title: "Onboarding Optimization",
            description:
              "Streamlined seller onboarding with automated workflows and personalized guidance",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Quality Assessment",
            description:
              "Intelligent seller vetting and quality scoring to maintain marketplace standards",
          },
        ],
      },
      {
        title: "Support & Success Automation",
        image: "/static/landing/industry/features/supportExpert.svg",
        bgColor: "bg-yellow-100",
        features: [
          {
            icon: "bg-purple-500",
            title: "Automated Support",
            description:
              "AI-powered customer and seller support with intelligent ticket routing and responses",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Success Metrics",
            description:
              "Track and optimize seller performance with AI-driven insights and recommendations",
          },
          {
            icon: "bg-yellow-400 rounded-br-full",
            title: "Proactive Intervention",
            description:
              "Identify at-risk sellers early and implement automated retention strategies",
          },
        ],
      },
      {
        title: "Community Operations",
        image: "/static/landing/industry/features/KYC.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-green-500",
            title: "Content Moderation",
            description:
              "Automated content review and moderation to maintain community standards",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Engagement Analytics",
            description:
              "AI-powered community insights and engagement optimization strategies",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Event Coordination",
            description:
              "Streamlined community event planning and automated member communications",
          },
        ],
      },
      {
        title: "Marketing & Marketplace Intelligence",
        image: "/static/landing/industry/features/marketing_operations.svg",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-orange-500",
            title: "Market Analysis",
            description:
              "AI-driven competitive analysis and market trend identification",
          },
          {
            icon: "bg-green-500 rounded-tl-full",
            title: "Campaign Optimization",
            description:
              "Automated marketing campaign management and performance optimization",
          },
          {
            icon: "bg-blue-400 rounded-br-full",
            title: "Growth Insights",
            description:
              "Intelligent recommendations for marketplace growth and expansion strategies",
          },
        ],
      },
    ],
  },
  impactMetrics: {
    bgColor: "bg-blue-50",
    metrics: [
      {
        value: "85",
        unit: "%",
        type: "Reduction",
        description: "in manual seller onboarding and support tasks",
      },
      {
        value: "60",
        unit: "%",
        type: "Faster",
        description: "seller acquisition and activation process",
      },
      {
        value: "3x",
        unit: "",
        type: "Faster",
        description: "quality provider onboarding while maintaining standards",
      },
    ],
  },
  demoVideo: {
    sectionTitle: "See Dust transform marketplace operations",
    videoUrl: "https://fast.wistia.net/embed/iframe/8q80neektv",
  },
  trustedBySecond: {
    title: "Trusted by marketplace leaders",
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
