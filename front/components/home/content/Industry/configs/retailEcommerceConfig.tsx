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
      "The AI Solution Trusted by Leading Retail Brands — say goodbye to scattered product data, operational bottlenecks, and missed market intelligence.",
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
    title: "AI Agents That Drive Commerce Forward",
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
        title: "Turn Customer Chaos Into Service Excellence",
        description:
          "Auto-route tickets and resolve inquiries. Teams handle complex issues while customer satisfaction stays high.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Automate Manual Operations",
        description:
          "Extract specs, generate content, automate workflows. Teams shift from repetitive tasks to strategic decisions.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Transform Scattered Data Into Intelligence",
        description:
          "Monitor competition and analyze market trends. Teams get actionable intelligence for smarter pricing and positioning.",
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
            icon: "bg-red-500",
            title: "Ticket Triaging",
            description:
              "Automatically classify support tickets, route to appropriate teams, suggest solutions, and optimize workflows for service efficiency.",
          },
          {
            icon: "bg-yellow-400 rounded-tr-full",
            title: "Enhanced Consumer Support",
            description:
              "Deliver automated responses for orders, returns, refunds, and policy inquiries; provide expert assistance across all retail channels.",
          },
          {
            icon: "bg-green-600 rounded-bl-full",
            title: "Support Insights",
            description:
              "Analyze ticket patterns to identify optimization opportunities and improve customer service efficiency.",
          },
          {
            icon: "bg-blue-400",
            title: "Seller Knowledge",
            description:
              "Provide sellers with updated information about new product lines, promotional campaigns, etc",
          },
        ],
      },
      {
        title: "Business Intelligence & Analytics",
        image: "/static/landing/industry/features/Data_graph.svg",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-pink-400",
            title: "Data Co-Pilot",
            description:
              "Create Excel formulas and SQL queries, guide A/B test design. Empower anyone to accelerate complex data work.",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "Self-Service Retail Analytics",
            description:
              "Empower teams with a self-service engine which can deliver actionable analytics and visualizations on trends and activity.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Consumer Feedback Analysis",
            description:
              "Systematically categorize customer reviews and feedback to uncover quality issues and improvement opportunities.",
          },
          {
            icon: "bg-blue-400",
            title: "News Monitoring",
            description:
              "Track real-time industry news, competitor announcements, and market developments impacting your business decisions.",
          },
        ],
      },
      {
<<<<<<< HEAD
        title: "Marketing",
        image: "/static/landing/industry/features/Radar.svg",
        bgColor: "bg-gray-100",
=======
        title: "Marketing & Intelligence",
        image: "/static/landing/industry/features/Radar_AIDigest.svg",
        bgColor: "bg-gray-950",
>>>>>>> 5777cc25881e0dffc9390770a0cee4b88d0fcb1e
        features: [
          {
            icon: "bg-pink-400",
            title: "Content Creation",
            description:
              "Generate multilingual customer engagement across email, reviews, social media, and feedback platforms consistently.",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "Brand Compliance Review",
            description:
              "Automatically check content against brand guidelines and regulatory requirements to ensure consistent messaging and compliance.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Reputation Monitoring",
            description:
              "Track real-time news mentions, online reputation, and brand sentiment across digital channels with alerts.",
          },
          {
            icon: "bg-green-600",
            title: "Industry & Competitive Research",
            description:
              "Conduct competitive analysis and market intelligence. Generate reports on competitors, trends, and positioning opportunities.",
          },
        ],
      },
      {
        title: "Product & Catalog Operations",
        image: "/static/landing/industry/features/Catalog.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-pink-400",
            title: "Product Information Management (PIM)",
            description:
              "Automatically extract and standardize product specifications from supplier catalogs into consistent, channel-optimized content.",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "Multi-Channel Content Adaptation",
            description:
              "Transform single product data into optimized content for different platforms and regulatory submissions.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Intelligent Product Categorization",
            description:
              "Automatically classify new products into appropriate categories based on specifications and performance data.",
          },
          {
            icon: "bg-blue-400",
            title: "Product Performance Insights",
            description:
              "Analyze which products drive revenue, margins, and customer loyalty for optimized catalog decisions.",
          },
        ],
      },
      {
        title: "Merchant Management",
        image: "/static/landing/industry/features/Provider_list.svg",
        bgColor: "bg-orange-100",
        features: [
          {
            icon: "bg-pink-400",
            title: "Merchant/Supplier Validation & Risk Assessment",
            description:
              "Instantly assess potential partners using comprehensive due diligence, financial screening, and online presence verification.",
          },
          {
            icon: "bg-red-500 rounded-tr-full",
            title: "RFP Response Automation",
            description:
              "Automatically generate comprehensive, tailored responses based on company capabilities, past proposals, and supplier requirements.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Contract Intelligence",
            description:
              "Analyze vendor agreements and partnership terms to identify risk factors and streamline negotiations.",
          },
          {
            icon: "bg-green-600",
            title: "Partnership Proposals & Communications",
            description:
              "Craft professional supplier communications, partnership proposals, and vendor relationship management emails.",
          },
        ],
      },
    ],
  },
  impactMetrics: {
    bgColor: "bg-green-50",
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
