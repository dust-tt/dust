import {
  CheckCircleIcon,
  MagicIcon,
  RocketIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";

import type {
  BenefitsProps,
  MetricProps,
} from "@app/components/home/content/Solutions/BenefitsSection";
import type {
  HeroProps,
  pageSettingsProps,
} from "@app/components/home/content/Solutions/configs/utils";
import type {
  CustomerStory,
  QuoteProps,
} from "@app/components/home/content/Solutions/CustomerStoriesSection";
import type { DemoVideoProps } from "@app/components/home/content/Solutions/DemoVideoSection";
import type { UseCaseProps } from "@app/components/home/content/Solutions/UseCasesSection";

// Config exports
export const pageSettings: pageSettingsProps = {
  uptitle: "Data & Analytics",
  title: <>Turn Data Into Business Decisions</>,
  from: "from-purple-200",
  to: "to-purple-500",
  description: (
    <>
      Transform complex data into instant insights, automate queries, and
      democratize analytics across teams.
    </>
  ),
  bulletPoints: [
    "Enable teams to analyze data independently",
    "Write SQL queries from natural language",
    "Create instant data visualizations and analysis",
    "Answer data questions with documentation context",
  ],
  image: "/static/landing/data-analytics/analyst.png",
};

export const Hero: HeroProps = {
  uptitle: pageSettings.uptitle,
  title: pageSettings.title,
  description: pageSettings.description,
  visuals: [
    {
      src: "/static/landing/data-analytics/data1.png",
      alt: "Data Visual 1",
      depth: -30,
    },
    {
      src: "/static/landing/data-analytics/data2.png",
      alt: "Data Visual 2",
      depth: -10,
    },
    {
      src: "/static/landing/data-analytics/data3.png",
      alt: "Data Visual 3",
      depth: 20,
    },
    {
      src: "/static/landing/data-analytics/data4.png",
      alt: "Data Visual 4",
      depth: 50,
    },
  ],
  ctaButtons: {
    primary: {
      label: "Get started",
      href: "/home/pricing",
      icon: RocketIcon,
    },
    secondary: {
      label: "Talk to sales",
      href: "/home/contact",
    },
  },
};

export const Benefits: BenefitsProps = {
  sectionTitle: "Reduce toil, scale data education and deepen exploration",
  items: [
    {
      icon: MagicIcon,
      title: "Focus on insights",
      description:
        "Maximize analysis time by automating query writing and data exploration.",
    },
    {
      icon: CheckCircleIcon,
      title: "Accelerate answers",
      description:
        "Instantly transform business questions into accurate queries and visualizations.",
    },
    {
      icon: UserGroupIcon,
      title: "Democratize data",
      description:
        "Turn complex data models into accessible insights for the entire organization.",
    },
  ],
};

export const Metrics: MetricProps = {
  metrics: [
    {
      value: "90%",
      description: <>faster RFP response times</>,
    },
    {
      value: "8h",
      description: <> saved weekly per rep for selling</>,
    },
  ],
  from: "from-amber-200",
  to: "to-amber-500",
};

export const UseCases: UseCaseProps = {
  sectionTitle: "Your use cases, your way",
  sectionDescription:
    "Customize and automate tasks without writing a single line of code.",
  items: [
    {
      title: "Self-serve analytics",
      content:
        "Execute complex data queries and generate visualizations automatically to answer business questions instantly.",
      images: ["/static/landing/data-analytics/analyst.png"],
    },
    {
      title: "SQL assistant",
      content:
        "Generate, debug and optimize SQL queries that align with your business logic and data models.",
      images: ["/static/landing/data-analytics/sqlWriter.png"],
    },
    {
      title: "Data catalog",
      content:
        "Navigate your entire data ecosystem with instant access to schemas and relationships across tables.",
      images: ["/static/landing/data-analytics/dataCatalog.png"],
    },
    {
      title: "Data runbooks",
      content:
        "Access and understand data team processes and documentation to streamline operations and troubleshooting.",
      images: ["/static/landing/data-analytics/dataDoc.png"],
    },
  ],
};

export const Quote: QuoteProps = {
  quote:
    "Thanks to what we've implemented at Alan, in less than three question iterations, I can craft the perfect SQL query I need and get the context behind it.",
  name: "Vincent Delagabbe",
  title: "Software Engineer at Alan",
  logo: "/static/landing/logos/alan.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl:
    "https://fast.wistia.net/embed/iframe/9u1uft5pg7?web_component=true&seo=true&videoFoam=true&captions=on",
};

export const Stories: CustomerStory[] = [
  {
    title: "20%+ productivity gains in Sales: Insights from Alan and Payfit",
    content:
      "Dust agents significantly lowered their acquisition costs, allowing them to hire more salespeople.",
    href: "https://blog.dust.tt/generative-ai-insights-alan-payfit-leaders/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/01/Founder.jpg",
  },
  {
    title: "Kyriba's RFP Agent for improving pre-sales efficiency",
    content:
      "43% of Kyriba employees save more than 3 hours weekly leveraging Dust for RFPs.",
    href: "https://blog.dust.tt/kyriba-accelerating-innovation-with-dust/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/10/kyriba_dust.jpg",
  },
  {
    title: "Lifen uses Dust AI agents to boost team productivity", // Soon to be replaced with Clay for RFP?
    content:
      "Lifen uses Dust AI agents to boost team productivity and save hours of work each week.",
    href: "https://blog.dust.tt/customer-story-lifen/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/11/lifen_dust_customer_story.jpg",
  },
];
