import { ActionShoppingBasketIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import { createLayoutConfig } from "@app/components/home/content/Industry/configs/utils";

export const marketplaceConfig: IndustryPageConfig = {
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
      label: "Marketplace",
      color: "blue",
      icon: ActionShoppingBasketIcon,
    },
    title: (
      <>
        Dust for
        <br /> Marketplaces
      </>
    ),
    description:
      "The AI solution powering Marketplace success. Streamline supplier acquisition, eliminate content bottlenecks, and scale support effortlessly.",
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
        logo: "/static/landing/logos/white/doctolib.svg",
        alt: "Doctolib logo",
      },
      bgColor: "bg-blue-800",
      textColor: "text-white",
    },
    decorativeShapes: {
      topRight: "/static/landing/industry/shapes/rounded-rectangle.svg",
      bottomLeft: "/static/landing/industry/shapes/diamond.svg",
    },
  },
  aiAgents: {
    title: "Empower your marketplace teams to focus on growth, not grunt work",
    description:
      "Dust connects your teams, automates operational complexity, and unlocks critical insights from your data—across supply acquisition, community engagement, support operations, and market intelligence.",
    bgColor: "bg-gray-50",
  },
  trustedBy: {
    title: "Trusted by marketplace leaders",
    logoSet: "marketplace",
  },
  painPoints: {
    title: "Transform how you work",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Accelerate quality provider acquisition",
        description:
          "Transform prospecting and qualification with automated workflows. Sign the best suppliers faster while efficiently answering all provider questions.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Scale content creation effortlessly",
        description:
          "Generate targeted, high-quality content at scale to keep supplier and customer communities engaged across all your markets.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Scale your best support expertise instantly",
        description:
          "Let AI handle tier 1 & 2 support so your experts can focus on complex cases that drive real marketplace value.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in action",
    useCases: [
      {
        title: "Supply growth & provider acquisition",
        image: "/static/landing/industry/features/Sales_agent.webp",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Prospection & lead enrichment",
            description:
              "Automatically aggregate and enrich service provider information using public data and marketplace insights.",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Account 360° view",
            description:
              "Generate comprehensive provider overviews combining platform activity, performance data, and engagement history.",
          },
          {
            icon: "bg-green-500",
            title: "Sales enablement",
            description:
              "Auto-draft responses to provider applications and inquiries using current marketplace policies and product information.",
          },
          {
            icon: "bg-pink-400 rounded-tl-full",
            title: "Sales insights",
            description:
              "Extract winning narratives from calls and coach teams on pitch delivery and objection response.",
          },
        ],
      },
      {
        title: "Support & success automation",
        image: "/static/landing/industry/features/UxWriter_2.webp",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-sky-400 rounded-br-full",
            title: "Smart request routing",
            description:
              "Route issues to the right team instantly, based on urgency and type.",
          },
          {
            icon: "bg-red-500",
            title: "Technical troubleshooting",
            description:
              "Accelerate resolution with deep troubleshooting and suggested resolution paths.",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Customer communication",
            description:
              "Craft clear, professional support communication at scale.",
          },
          {
            icon: "bg-green-500",
            title: "Support insights",
            description:
              "Analyze interactions and feedback to improve marketplace experience.",
          },
          {
            icon: "bg-pink-400",
            title: "Knowledge hub building",
            description:
              "Transform resolved cases into searchable resources for providers, customers, and support teams.",
          },
        ],
      },
      {
        title: "Community operations",
        image: "/static/landing/industry/features/Compliance_verification.webp",
        bgColor: "bg-rose-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Automated KYC & verification",
            description:
              "Extract and validate information from provider documents, flagging issues for KYC and compliance checks.",
          },
          {
            icon: "bg-pink-400 rounded-tl-full",
            title: "Community engagement",
            description:
              "Generate targeted content to keep your provider community engaged.",
          },
          {
            icon: "bg-red-500",
            title: "Community education",
            description:
              "Deliver updates and education to keep your providers active and successful.",
          },
        ],
      },
      {
        title: "Marketing & marketplace intelligence",
        image: "/static/landing/industry/features/Content_localization.webp",
        bgColor: "bg-yellow-100",
        features: [
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Content creation & localization",
            description:
              "Turn raw notes into SEO-optimized communications across multiple languages.",
          },
          {
            icon: "bg-blue-500",
            title: "Industry & competitive intelligence",
            description:
              "Monitor competitive activity, pricing trends and analyze reports to inform platform strategy.",
          },
          {
            icon: "bg-green-500",
            title: "Customer insights",
            description: "Summarize feedback to identify improvement areas.",
          },
          {
            icon: "bg-pink-400 rounded-tl-full",
            title: "Marketplace analytics",
            description:
              "Retrieve analytics for internal and stakeholder reporting.",
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
        type: "Adoption",
        description: "weekly active users",
      },
      {
        value: "50",
        unit: "%",
        type: "Faster",
        description: "support ticket resolution through smart routing",
      },
    ],
  },
  demoVideo: {
    sectionTitle: "See Dust in motion",
    videoUrl: "https://fast.wistia.net/embed/iframe/r0dwaexoez",
  },
  testimonial: {
    quote:
      "Dust has empowered our employees to work smarter, innovate, and push boundaries.",
    author: {
      name: "Matthieu Birach",
      title: "Chief People Officer at Doctolib",
    },
    company: {
      logo: "/static/landing/logos/white/doctolib.svg",
      alt: "Doctolib logo",
    },
    bgColor: "bg-blue-800",
    textColor: "text-white",
  },
  customerStories: {
    title: "Customer stories",
    stories: [
      {
        title: "Malt cuts support ticket closing time by 50% with Dust",
        content:
          "Malt streamlines customer support using Dust's AI platform for rapid, consistent multilingual responses.",
        href: "https://blog.dust.tt/malt-customer-support/",
        src: "https://blog.dust.tt/content/images/size/w2000/2024/12/Malt_Customer_Story_Dust_Support.jpg",
      },
      {
        title:
          "Blueground accelerates customer support resolution time with Dust",
        content:
          "Discover how Blueground boosted satisfaction and cut resolution time using Dust agents.",
        href: "https://blog.dust.tt/customer-support-blueground/",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/06/Blueground_dust.jpg",
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
