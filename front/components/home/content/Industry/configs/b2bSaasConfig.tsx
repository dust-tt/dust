import { CompanyIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";

export const b2bSaasConfig: IndustryPageConfig = {
  hero: {
    chip: {
      label: "B2B SaaS",
      color: "rose",
      icon: CompanyIcon,
    },
    title: (
      <>
        Dust for
        <br /> B2B SaaS
      </>
    ),
    description:
      "The AI Solution Trusted by Leading SaaS Innovators. Say goodbye to scattered info, manual busywork, and buried insights.",
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
    decorativeShapes: {
      topRight: "/static/landing/industry/shapes/rounded-rectangle.svg",
      bottomLeft: "/static/landing/industry/shapes/diamond.svg",
    },
  },
  aiAgents: {
    title: "What if your teams focused on growth?",
    description:
      "Deploy agents that research information, share insights across teams, and automate routine tasks—handling all the time-consuming work that slows you down. Your teams focus on growing your business while leveraging everything your organization has already built.",
    bgColor: "bg-gray-50",
  },
  trustedBy: {
    title: "Trusted by SaaS leaders",
    logoSet: "b2bSaas",
  },
  painPoints: {
    title: "Transform how you work",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Trade busy work for strategic work",
        description:
          "Stop wasting hours on research and admin tasks. Focus your team on high-value work that actually moves the business forward",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Stop losing customer intelligence",
        description:
          "Surface knowledge trapped in customer calls, support threads, and account discussions—making critical customer insights instantly available to every team",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Scale your best people instantly",
        description:
          "Let AI handle routine questions so your experts can focus on solving the problems that really matter",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in Action",
    useCases: [
      {
        title: "GTM Operations & Sales Enablement",
        image: "/static/landing/industry/features/GTM_Ops.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-red-500",
            title: "360° Account Intelligence",
            description:
              "Merge engagement, CRM, and market signals for every account",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Automated Follow-Ups",
            description:
              "Automate customer follow-ups and update your CRM using meeting transcripts and notes",
          },
          {
            icon: "bg-blue-500 rounded-bl-full",
            title: "Prospect Questions",
            description:
              "Automate RFP responses and prospect answers using your internal knowledge base",
          },
          {
            icon: "bg-sky-400 rounded-br-full",
            title: "Revenue Intelligence",
            description:
              "Extract actionable insights from customer-facing interactions",
          },
        ],
      },
      {
        title: "Marketing Operations",
        image: "/static/landing/industry/features/marketing_operations.svg",
        bgColor: "bg-rose-100",
        features: [
          {
            icon: "bg-pink-400 rounded-tl-full",
            title: "Content Localization at Scale",
            description:
              "Launch campaigns globally, keeping brand and technical consistency",
          },
          {
            icon: "bg-red-500",
            title: "Market Intelligence",
            description:
              "Monitor trends and competitors to equip GTM and sales teams",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Content Optimization",
            description: "Turn drafts into high-conversion assets",
          },
        ],
      },
      {
        title: "Customer Experience",
        image: "/static/landing/industry/features/customer_experience.svg",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-pink-400 rounded-tl-full",
            title: "AI Ticket Deflection & Routing",
            description:
              "Rapidly resolve L1 cases, route complex issues, and ensure SLA compliance",
          },
          {
            icon: "bg-red-500",
            title: "Accelerated Case Resolution",
            description:
              "Suggest docs, similar tickets, and pre-draft responses for agents",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Knowledge Base Automation",
            description:
              "Turn support resolutions into always-fresh, searchable documentation",
          },
          {
            icon: "bg-green-500",
            title: "Support Analytics",
            description:
              "Analyze customer interactions to surface insights, optimize documentation, and improve CSAT",
          },
        ],
      },
      {
        title: "Engineering Operations",
        image: "/static/landing/industry/features/engineering_ops.svg",
        bgColor: "bg-gray-100",
        features: [
          {
            icon: "bg-pink-400 rounded-tl-full",
            title: "AI-Powered Code Debugging",
            description:
              "Surface relevant context, docs, and historical issues inside your IDE",
          },
          {
            icon: "bg-red-500",
            title: "Automated Code Reviews",
            description: "Maintain standards and compliance at scale",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Incident Response",
            description:
              "Execute automated runbooks, integrate communications, and enable rapid root cause analysis",
          },
          {
            icon: "bg-green-500",
            title: "Continuous Doc Generation",
            description:
              "Keep user and API docs up-to-date from code changes automatically",
          },
        ],
      },
    ],
  },
  impactMetrics: {
    bgColor: "bg-blue-50",
    metrics: [
      {
        value: "80",
        unit: "%",
        type: "Reduction",
        description: "in prospection time with automated lead enrichment",
        bgColor: "bg-blue-300",
        badgeColor: "bg-pink-300",
        badgeTextColor: "text-gray-900",
        borderRadius: "rounded-t-full",
      },
      {
        value: "60",
        unit: "%",
        type: "Increase",
        description: "in lead qualification speed with intelligent scoring",
        bgColor: "bg-pink-300",
        badgeColor: "bg-red-500",
        badgeTextColor: "text-white",
        borderRadius: "rounded-l-full",
      },
      {
        value: "40",
        unit: "%",
        type: "Faster",
        description: "customer support resolution with AI-powered insights",
        bgColor: "bg-lime-300",
        badgeColor: "bg-green-600",
        badgeTextColor: "text-white",
        borderRadius: "rounded-r-full",
      },
    ],
  },
  demoVideo: {
    sectionTitle: "See Dust in motion",
    videoUrl: "https://fast.wistia.net/embed/iframe/8q80neektv",
  },
  trustedBySecond: {
    title: "Trusted by SaaS leaders",
    logoSet: "b2bSaas",
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
