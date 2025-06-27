import { CompanyIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import { createLayoutConfig } from "@app/components/home/content/Industry/configs/utils";

export const b2bSaasConfig: IndustryPageConfig = {
  layout: createLayoutConfig([
    "hero",
    "aiAgents",
    "trustedBy",
    "painPoints",
    "dustInAction",
    "impactMetrics",
    "demoVideo",
    "testimonial",
    "customerStories",
    "justUseDust",
  ]),
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
      "The AI solution trusted by leading SaaS innovators. Say goodbye to scattered info, manual busywork, and buried insights.",
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
        title: "GTM operations & sales enablement",
        image: "/static/landing/industry/features/Sales_agent.webp",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-red-500",
            title: "360° account intelligence",
            description:
              "Merge engagement, CRM, and market signals for every account",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Automated follow-ups",
            description:
              "Automate customer follow-ups and update your CRM using meeting transcripts and notes",
          },
          {
            icon: "bg-blue-500 rounded-bl-full",
            title: "Prospect questions",
            description:
              "Automate RFP responses and prospect answers using your internal knowledge base",
          },
          {
            icon: "bg-sky-400 rounded-br-full",
            title: "Revenue intelligence",
            description:
              "Extract actionable insights from customer-facing interactions",
          },
        ],
      },
      {
        title: "Marketing operations",
        image: "/static/landing/industry/features/Content_localization.webp",
        bgColor: "bg-rose-100",
        features: [
          {
            icon: "bg-pink-400 rounded-tl-full",
            title: "Content localization at scale",
            description:
              "Launch campaigns globally, keeping brand and technical consistency",
          },
          {
            icon: "bg-red-500",
            title: "Market intelligence",
            description:
              "Monitor trends and competitors to equip GTM and sales teams",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Content optimization",
            description: "Turn drafts into high-conversion assets",
          },
        ],
      },
      {
        title: "Customer experience",
        image: "/static/landing/industry/features/Connection_management.webp",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-pink-400 rounded-tl-full",
            title: "AI ticket deflection & routing",
            description:
              "Rapidly resolve L1 cases, route complex issues, and ensure SLA compliance",
          },
          {
            icon: "bg-red-500",
            title: "Accelerated case resolution",
            description:
              "Suggest docs, similar tickets, and pre-draft responses for agents",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Knowledge base automation",
            description:
              "Turn support resolutions into always-fresh, searchable documentation",
          },
          {
            icon: "bg-green-500",
            title: "Support analytics",
            description:
              "Analyze customer interactions to surface insights, optimize documentation, and improve CSAT",
          },
        ],
      },
      {
        title: "Engineering operations",
        image: "/static/landing/industry/features/Eng_debug.webp",
        bgColor: "bg-gray-100",
        features: [
          {
            icon: "bg-pink-400 rounded-tl-full",
            title: "AI-Powered code debugging",
            description:
              "Surface relevant context, docs, and historical issues inside your IDE",
          },
          {
            icon: "bg-red-500",
            title: "Automated code reviews",
            description: "Maintain standards and compliance at scale",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "incident response",
            description:
              "Execute automated runbooks, integrate communications, and enable rapid root cause analysis",
          },
          {
            icon: "bg-green-500",
            title: "Continuous doc generation",
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
        value: "20",
        unit: "%",
        type: "Increase",
        description: "in productivity gains for Sales teams",
        bgColor: "bg-pink-300",
        badgeColor: "bg-red-500",
        badgeTextColor: "text-white",
        borderRadius: "rounded-l-full",
      },
      {
        value: "50",
        unit: "%",
        type: "Faster",
        description: "customer support resolution time",
        bgColor: "bg-lime-300",
        badgeColor: "bg-green-600",
        badgeTextColor: "text-white",
        borderRadius: "rounded-r-full",
      },
      {
        value: "90",
        unit: "%",
        type: "Reduction",
        description: "in content localization time",
        bgColor: "bg-blue-300",
        badgeColor: "bg-pink-300",
        badgeTextColor: "text-gray-900",
        borderRadius: "rounded-t-full",
      },
    ],
  },
  demoVideo: {
    sectionTitle: "See Dust in motion",
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
          "Germi, Qonto’s AI assistant, analyzes German industry codes and screens prohibited activities, automating compliance checks across European markets.",
        href: "https://blog.dust.tt/qonto-dust-ai-partnership/",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_qonto.png",
      },
      {
        title: "Kyriba’s adoption of Dust across all functions",
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
