import { ActionStoreIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import { createLayoutConfig } from "@app/components/home/content/Industry/configs/utils";

export const retailEcommerceConfig: IndustryPageConfig = {
  seo: {
    title: "Dust for Retail & e-Commerce",
    description:
      "The AI Solution trusted by leading retail brands — say goodbye to scattered product data, operational bottlenecks, and missed market intelligence.",
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
      "The AI Solution trusted by leading retail brands — say goodbye to scattered product data, operational bottlenecks, and missed market intelligence.",
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
        logo: "/static/landing/logos/white/fleet.svg",
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
    title: "AI agents that drive commerce forward",
    description:
      "Accelerate retail & e-commerce growth with AI agents built for modern commerce. Dust automates customer support, operations, and competitive intelligence—freeing your teams to focus on strategic growth decisions.",
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
        title: "Turn customer chaos into service excellence",
        description:
          "Auto-route tickets and resolve inquiries. Teams handle complex issues while customer satisfaction stays high.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Automate manual operations",
        description:
          "Extract specs, generate content, automate workflows. Teams shift from repetitive tasks to strategic decisions.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Transform scattered data into intelligence",
        description:
          "Monitor competition and analyze market trends. Teams get actionable intelligence for smarter pricing and positioning.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in action",
    useCases: [
      {
        title: "Customer service",
        image: "/static/landing/industry/features/UxWriter_2.webp",
        bgColor: "bg-pink-100",
        features: [
          {
            icon: "bg-red-500",
            title: "Ticket triaging",
            description:
              "Automatically classify support tickets, route to appropriate teams, suggest solutions, and optimize workflows for service efficiency.",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Enhanced consumer support",
            description:
              "Deliver automated responses for orders, returns, refunds, and policy inquiries; provide expert assistance across all retail channels.",
          },
          {
            icon: "bg-green-600 rounded-bl-full",
            title: "Support insights",
            description:
              "Analyze ticket patterns to identify optimization opportunities and improve customer service efficiency.",
          },
          {
            icon: "bg-blue-400",
            title: "Seller knowledge",
            description:
              "Provide sellers with updated information about new product lines, promotional campaigns, etc",
          },
        ],
      },
      {
        title: "Business intelligence & analytics",
        image: "/static/landing/industry/features/Data_graph.webp",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-pink-400",
            title: "Data co-pilot",
            description:
              "Create Excel formulas and SQL queries, guide A/B test design. Empower anyone to accelerate complex data work.",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "Self-service retail analytics",
            description:
              "Empower teams with a self-service engine which can deliver actionable analytics and visualizations on trends and activity.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Consumer feedback analysis",
            description:
              "Systematically categorize customer reviews and feedback to uncover quality issues and improvement opportunities.",
          },
          {
            icon: "bg-blue-400",
            title: "News monitoring",
            description:
              "Track real-time industry news, competitor announcements, and market developments impacting your business decisions.",
          },
        ],
      },
      {
        title: "Marketing & intelligence",
        image: "/static/landing/industry/features/Radar_AIDigest.webp",
        bgColor: "bg-gray-950",
        features: [
          {
            icon: "bg-pink-400",
            title: "Content creation",
            description:
              "Generate multilingual customer engagement across email, reviews, social media, and feedback platforms consistently.",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "Brand compliance review",
            description:
              "Automatically check content against brand guidelines and regulatory requirements to ensure consistent messaging and compliance.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Reputation monitoring",
            description:
              "Track real-time news mentions, online reputation, and brand sentiment across digital channels with alerts.",
          },
          {
            icon: "bg-green-600",
            title: "Industry & competitive research",
            description:
              "Conduct competitive analysis and market intelligence. Generate reports on competitors, trends, and positioning opportunities.",
          },
        ],
      },
      {
        title: "Product & catalog operations",
        image: "/static/landing/industry/features/Catalog.webp",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-pink-400",
            title: "Product information management (PIM)",
            description:
              "Automatically extract and standardize product specifications from supplier catalogs into consistent, channel-optimized content.",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "Multi-channel content adaptation",
            description:
              "Transform single product data into optimized content for different platforms and regulatory submissions.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Intelligent product categorization",
            description:
              "Automatically classify new products into appropriate categories based on specifications and performance data.",
          },
          {
            icon: "bg-blue-400",
            title: "Product performance insights",
            description:
              "Analyze which products drive revenue, margins, and customer loyalty for optimized catalog decisions.",
          },
        ],
      },
      {
        title: "Merchant management",
        image: "/static/landing/industry/features/Provider_list.webp",
        bgColor: "bg-orange-100",
        features: [
          {
            icon: "bg-pink-400",
            title: "Merchant/Supplier validation & risk assessment",
            description:
              "Instantly assess potential partners using comprehensive due diligence, financial screening, and online presence verification.",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "RFP response automation",
            description:
              "Automatically generate comprehensive, tailored responses based on company capabilities, past proposals, and supplier requirements.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Contract intelligence",
            description:
              "Analyze vendor agreements and partnership terms to identify risk factors and streamline negotiations.",
          },
          {
            icon: "bg-green-600",
            title: "Partnership proposals & communications",
            description:
              "Craft professional supplier communications, partnership proposals, and vendor relationship management emails.",
          },
        ],
      },
    ],
  },
  impactMetrics: {
    bgColor: "bg-blue-50",
    metrics: [
      {
        value: "50",
        unit: "%",
        type: "Reduction",
        description: "in customer support resolution time",
      },
      {
        value: "70",
        unit: "%",
        type: "Faster",
        description: "content creation in all languages",
      },
      {
        value: "80",
        unit: "%",
        type: "Adoption",
        description: "weekly active users",
      },
    ],
  },
  demoVideo: {
    sectionTitle: "See Dust in motion",
    videoUrl: "https://fast.wistia.net/embed/iframe/9u1uft5pg7",
  },
  testimonial: {
    quote:
      "Curiosity turned into necessity: I couldn't do half my job without Dust.",
    author: {
      name: "Valentine Chelius",
      title: "Head of Marketing",
    },
    company: {
      logo: "/static/landing/logos/white/fleet.svg",
      alt: "Fleet Logo",
    },
    bgColor: "bg-green-600",
    textColor: "text-white",
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
