import { CompanyIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import { createLayoutConfig } from "@app/components/home/content/Industry/configs/utils";

export const b2bSaasConfig: IndustryPageConfig = {
  seo: {
    title: "Dust for B2B SaaS",
    description:
      "The AI solution trusted by leading SaaS innovators. Say goodbye to scattered info, manual busywork, and buried insights.",
  },
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
        title: "Automate busywork that slows you down",
        description:
          "Stop wasting hours on research, data entry, and repetitive tasks. Deploy AI that works your way—understanding your processes, terminology, and decision-making patterns",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Build your intelligence engine",
        description:
          "Transform scattered conversations, documents, and insights across all departments into a unified knowledge base that gets smarter with every interaction",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Scale your best people instantly",
        description:
          "New team members gain immediate access to the expertise and methodologies that typically take years to develop, with AI agents that work exactly how your organization works",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in action",
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
              "Generate snapshots of your customers leveraging product usage, support tickets, and previous interactions",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Automated follow-ups",
            description:
              "Automate follow-ups and CRM updates using meeting transcripts and cross-team insights automatically",
          },
          {
            icon: "bg-blue-500 rounded-bl-full",
            title: "Prospect questions",
            description:
              "Generate responses using your complete knowledge base—technical docs, competitive intel, customer stories",
          },
          {
            icon: "bg-sky-400 rounded-br-full",
            title: "Revenue intelligence",
            description:
              "Extract insights from interactions to surface sales, support, and product feedback",
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
              "Maintain brand voice and technical accuracy across markets using tailored agents",
          },
          {
            icon: "bg-red-500",
            title: "Market intelligence",
            description:
              "Monitor trends and competitors leveraging external sources and real customer conversations",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Content optimization",
            description:
              "Create content using authentic customer language from sales calls and brand guidelines",
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
              "Pre-draft responses using company context - internal docs, similar tickets, recent changes",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Knowledge base automation",
            description:
              "Convert tickets into help articles referencing actual customer conversations and decisions",
          },
          {
            icon: "bg-green-500",
            title: "Support insights",
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
              "Provide context beyond your codebase - recent changes, customer impact - to debug faster",
          },
          {
            icon: "bg-red-500",
            title: "Automated code reviews",
            description:
              "Tie your internal guidelines to automate code reviews and maintain standards",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Incident response",
            description:
              "Troubleshoot issues, automate communications, and dig deep into your context for your post-mortems",
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
        href: "/blog/clay-scaling-gtme-team",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/06/clay_dust_agents.jpg",
      },
      {
        title:
          "20%+ productivity gains in Sales: Insights from Alan and Payfit",
        content:
          "Leading companies share how Dust agents deliver significant productivity improvements and measurable ROI in sales operations.",
        href: "/blog/generative-ai-insights-alan-payfit-leaders",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/01/Founder.jpg",
      },
      {
        title:
          "50% Time Savings: How Didomi Transformed Privacy Compliance with AI",
        content:
          "Didomi's legal team cuts workload by 50% using Dust's AI assistants for privacy compliance and legal document management.",
        href: "/blog/how-thomas-uses-ai-assistants-to-manage-legal-and-data-privacy-at-didomi",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Didomi-__-Dust.jpg",
      },
      {
        title:
          "50,000 Hours Saved: How Qonto Revolutionized Compliance and Risk Assessment with AI",
        content:
          "Germi, Qonto's AI assistant, analyzes German industry codes and screens prohibited activities, automating compliance checks across European markets.",
        href: "/blog/qonto-dust-ai-partnership",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Qonto-__-Dust.jpg",
      },
      {
        title: "Kyriba's adoption of Dust across all functions",
        content:
          "43% of Kyriba employees save more than 3 hours weekly leveraging Dust for RFPs.",
        href: "/blog/kyriba-accelerating-innovation-with-dust",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Kyriba-__-Dust.png",
      },
    ],
  },
  justUseDust: {
    title: "Just use Dust",
    titleColor: "text-blue-600",
    ctaButtons: {
      primary: {
        label: "Start Free Trial",
        href: "/api/workos/login",
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
