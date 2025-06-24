import { ActionStoreIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";

export const retailEcommerceConfig: IndustryPageConfig = {
  hero: {
    chip: {
      label: "Retail & e-Commerce",
      color: "green",
      icon: ActionStoreIcon,
    },
    title: (
      <>
        Dust for
        <br /> Retail & e-Commerce
      </>
    ),
    description:
      "AI Agents for Compliance, Support, and Growth. Transform retail operations with intelligent automation that enhances customer experience, streamlines operations, and drives sustainable growth.",
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
        "Curiosity turned into necessity: I couldn't do half my job without Dust.",
      author: {
        name: "Valentine Chelius",
        title: "Head of Marketing",
      },
      company: {
        logo: "/static/landing/logos/color/fleet.png",
        alt: "Fleet Logo",
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
    title: "AI Agents for Compliance, Support, and Growth",
    description:
      "Deploy specialized AI agents that automate retail workflows, enhance customer service, and ensure regulatory compliance—transforming how your retail business operates while improving customer satisfaction and driving growth.",
    bgColor: "bg-gray-50",
  },
  trustedBy: {
    title: "Trusted by retail leaders",
    logoSet: "retail",
  },
  painPoints: {
    title: "Transform how you work",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Scale Customer Chain and Online Experience",
        description:
          "Automate customer service, order management, and inventory operations to scale efficiently while maintaining exceptional customer experience across all channels.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Automate Manual Operations & Support",
        description:
          "Streamline manual processes from inventory management to customer support, reducing operational overhead and improving response times.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Enhance Supplier Relationships & Analytics",
        description:
          "Leverage AI-powered insights for better supplier management, demand forecasting, and data-driven decision making to optimize your supply chain.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in Action",
    useCases: [
      {
        title: "Customer Service",
        image: "/static/landing/industry/features/uxWriter_2.svg",
        bgColor: "bg-pink-100",
        features: [
          {
            icon: "bg-pink-500",
            title: "AI-Powered Customer Support",
            description:
              "Instantly resolve customer queries about orders, returns, and product information with AI assistants",
          },
          {
            icon: "bg-blue-500 rounded-tr-full",
            title: "Order Tracking & Updates",
            description:
              "Provide real-time order status updates and automated customer communications",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Product Recommendations",
            description:
              "AI-driven personalized product recommendations and cross-selling opportunities",
          },
        ],
      },
      {
        title: "Business Intelligence & Analytics",
        image: "/static/landing/industry/features/Data_graph.svg",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-green-500",
            title: "Sales Performance Analytics",
            description:
              "Advanced analytics on sales trends, customer behavior, and product performance",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Inventory Optimization",
            description:
              "AI-powered demand forecasting and inventory management optimization",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Customer Insights & Segmentation",
            description:
              "Deep customer analytics and behavioral segmentation for targeted marketing",
          },
        ],
      },
      {
        title: "Marketing & Intelligence",
        image: "/static/landing/industry/features/Radar_AIDigest.svg",
        bgColor: "bg-gray-950",
        features: [
          {
            icon: "bg-gray-500",
            title: "Campaign Optimization",
            description:
              "AI-driven marketing campaign optimization and performance analysis",
          },
          {
            icon: "bg-green-500 rounded-tl-full",
            title: "Content Generation",
            description:
              "Automated product descriptions, marketing copy, and promotional content creation",
          },
          {
            icon: "bg-blue-400 rounded-br-full",
            title: "Market Intelligence",
            description:
              "Competitive analysis and market trend identification for strategic planning",
          },
        ],
      },
      {
        title: "Product & Catalog Operations",
        image: "/static/landing/industry/features/Catalog.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Product Information Management",
            description:
              "Automated product data management and catalog optimization",
          },
          {
            icon: "bg-green-500 rounded-tl-full",
            title: "Pricing Strategy Optimization",
            description:
              "AI-powered dynamic pricing and competitive pricing analysis",
          },
          {
            icon: "bg-orange-400 rounded-br-full",
            title: "Quality Control & Reviews",
            description:
              "Automated quality checks and review analysis for product improvements",
          },
        ],
      },
      {
        title: "Merchant Management",
        image: "/static/landing/industry/features/Provider_list.svg",
        bgColor: "bg-orange-100",
        features: [
          {
            icon: "bg-orange-500",
            title: "Supplier Relationship Management",
            description:
              "Automated supplier communications and performance tracking",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Vendor Onboarding",
            description:
              "Streamlined vendor onboarding process with automated workflows",
          },
          {
            icon: "bg-green-400 rounded-br-full",
            title: "Contract & Compliance Management",
            description:
              "Automated contract management and compliance monitoring for suppliers",
          },
        ],
      },
    ],
  },
  impactMetrics: {
    bgColor: "bg-green-50",
    metrics: [
      {
        value: "70",
        unit: "%",
        type: "Reduction",
        description: "in customer service response time",
      },
      {
        value: "55",
        unit: "%",
        type: "Improvement",
        description: "in inventory management efficiency",
      },
      {
        value: "45",
        unit: "%",
        type: "Increase",
        description: "in customer satisfaction scores",
      },
    ],
  },
  demoVideo: {
    sectionTitle: "See Dust in motion",
    videoUrl: "https://fast.wistia.net/embed/iframe/8q80neektv",
  },
  testimonial: {
    quote:
      "Curiosity turned into necessity: I couldn't do half my job without Dust.",
    author: {
      name: "Valentine Chelius",
      title: "Head of Marketing",
    },
    company: {
      logo: "/static/landing/logos/color/fleet.png",
      alt: "Fleet Logo",
    },
    bgColor: "bg-green-600",
    textColor: "text-white",
  },
  customerStories: {
    title: "Customer stories",
    stories: [
      {
        title: "Building a Marketing Engine from Scratch at Fleet",
        content:
          "With just two interns, Valentine created a scalable marketing operation using Dust’s AI capabilities for content and brand management.",
        href: "https://blog.dust.tt/how-valentine-head-of-marketing-at-fleet-uses-dust/",
        src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_fleet.png",
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
    titleColor: "text-green-600",
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
    bgColor: "bg-green-50",
    decorativeShapes: true,
  },
};
