import { ActionLightbulbIcon } from "@dust-tt/sparkle";

import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";

export const energyUtilitiesConfig: IndustryPageConfig = {
  hero: {
    chip: {
      label: "Energy & Utilities",
      color: "golden",
      icon: ActionLightbulbIcon,
    },
    title: (
      <>
        Dust for
        <br /> Energy & Utilities
      </>
    ),
    description:
      "The AI Solution Trusted by Energy & Utilities Leaders—Say goodbye to scattered data, manual workflows, and buried insights.",
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
        name: "Robert Johnson",
        title: "Operations Director",
      },
      company: {
        logo: "/static/landing/logos/color/placeholder.png",
        alt: "Energy Company logo",
      },
      bgColor: "bg-golden-600",
      textColor: "text-white",
    },
    decorativeShapes: {
      topRight: "/static/landing/industry/shapes/rounded-rectangle.svg",
      bottomLeft: "/static/landing/industry/shapes/diamond.svg",
    },
  },
  aiAgents: {
    title: "AI agents for energy operations",
    description:
      "Deploy specialized AI agents that transform energy and utilities workflows, from commercial operations to field management, helping companies optimize efficiency and customer service.",
    bgColor: "bg-gray-50",
  },
  trustedBy: {
    title: "Trusted by energy leaders",
    logoSet: "default",
  },
  painPoints: {
    title: "3 Pain points Dust solves",
    painPoints: [
      {
        icon: "/static/landing/industry/d-blue.svg",
        title: "Operational Costs: Inefficient Knowledge Transfer",
        description:
          "Critical institutional knowledge vanishes with staff turnover. Distributed teams repeat errors and rework due to siloed expertise, inflating operational costs across development and maintenance cycles.",
        color: "blue",
      },
      {
        icon: "/static/landing/industry/d-red.svg",
        title: "Customer Retention: Fragmented Information Access",
        description:
          "Frontline teams waste time hunting across disconnected systems rather than resolving issues. Delays in diagnosing infrastructure problems and inconsistent service resolution threaten customer trust.",
        color: "red",
      },
      {
        icon: "/static/landing/industry/d-green.svg",
        title: "Revenue Leakage: Manual Compliance Workflows",
        description:
          "Manual review of contracts, permits, and regulatory documents creates bottlenecks. Legal delays and reactive compliance monitoring extend time-to-revenue for new projects.",
        color: "green",
      },
    ],
  },
  dustInAction: {
    title: "Dust in Action",
    useCases: [
      {
        title: "Commercial Operations",
        image: "/static/landing/industry/features/commercial_operations.svg",
        bgColor: "bg-gray-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Documentation and process efficiency",
            description:
              "Automated documentation management and process optimization for commercial energy operations",
          },
          {
            icon: "bg-green-500 rounded-tr-full",
            title: "Regulatory Compliance Management",
            description:
              "Streamlined regulatory reporting and compliance monitoring for energy regulations",
          },
          {
            icon: "bg-orange-400 rounded-bl-full",
            title: "Contract Analysis and Management",
            description:
              "AI-powered contract review and vendor management for energy suppliers and partners",
          },
          {
            icon: "bg-purple-400 rounded-br-full",
            title: "Market Analysis and Forecasting",
            description:
              "Advanced market intelligence and energy demand forecasting for strategic planning",
          },
          {
            icon: "bg-red-500",
            title: "Risk Management and Assessment",
            description:
              "Comprehensive risk analysis and mitigation strategies for energy operations",
          },
        ],
      },
      {
        title: "Customer Service Operations",
        image:
          "/static/landing/industry/features/customer_service_operations.svg",
        bgColor: "bg-gray-100",
        features: [
          {
            icon: "bg-red-500",
            title: "Build & Test proactive automated self-service applications",
            description:
              "AI-powered customer portals and automated service applications for enhanced user experience",
          },
          {
            icon: "bg-orange-400 rounded-tr-full",
            title: "Intelligent outage management",
            description:
              "Automated outage detection, customer communications, and restoration timeline updates",
          },
          {
            icon: "bg-blue-500 rounded-bl-full",
            title: "Personalized Communication and Alerts",
            description:
              "Smart notification systems and personalized energy usage insights for customers",
          },
          {
            icon: "bg-green-400 rounded-br-full",
            title: "Automated Billing and Payment Processing",
            description:
              "Streamlined billing operations and intelligent payment processing systems",
          },
        ],
      },
      {
        title: "Field Operations",
        image: "/static/landing/industry/features/field_operations.svg",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-blue-500",
            title: "Installation access and documentation efficiency",
            description:
              "Digital workflow management for field installations and comprehensive documentation systems",
          },
          {
            icon: "bg-green-500 rounded-tl-full",
            title: "Mobile Work Management Integration",
            description:
              "Integrated mobile platforms for field workers with real-time updates and task coordination",
          },
          {
            icon: "bg-orange-400 rounded-br-full",
            title: "Equipment Maintenance Scheduling",
            description:
              "Predictive maintenance scheduling and automated work order generation for field equipment",
          },
          {
            icon: "bg-purple-400",
            title: "Asset Inventory and Tracking",
            description:
              "Intelligent asset management and real-time inventory tracking for field operations",
          },
        ],
      },
      {
        title: "Project Management & Strategic Operations",
        image: "/static/landing/industry/features/project_management.svg",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-red-500",
            title: "Planning, executions, and business intelligence",
            description:
              "Comprehensive project planning tools with AI-driven business intelligence and execution tracking",
          },
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Resource Allocation Optimization",
            description:
              "Intelligent resource planning and allocation optimization for energy projects",
          },
          {
            icon: "bg-green-400 rounded-br-full",
            title: "Performance Analytics and Reporting",
            description:
              "Advanced analytics and automated reporting for project performance and strategic insights",
          },
          {
            icon: "bg-orange-400",
            title: "Sustainability and Environmental Compliance",
            description:
              "Environmental impact tracking and sustainability reporting for energy operations",
          },
        ],
      },
    ],
  },
  impactMetrics: {
    bgColor: "bg-golden-50",
    metrics: [
      {
        value: "65",
        unit: "%",
        type: "Reduction",
        description: "in operational costs and manual processes",
      },
      {
        value: "80",
        unit: "%",
        type: "Improvement",
        description: "in customer service response times",
      },
      {
        value: "55",
        unit: "%",
        type: "Faster",
        description: "field operations and maintenance scheduling",
      },
    ],
  },
  demoVideo: {
    sectionTitle: "See Dust transform energy operations",
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
    ],
  },
  justUseDust: {
    title: "Just use Dust",
    titleColor: "text-golden-600",
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
    bgColor: "bg-golden-50",
    decorativeShapes: true,
  },
};
