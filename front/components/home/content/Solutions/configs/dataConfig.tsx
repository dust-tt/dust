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
  CustomerStory,
  QuoteProps,
} from "@app/components/home/content/Solutions/CustomerStoriesSection";
import type { DemoVideoProps } from "@app/components/home/content/Solutions/DemoVideoSection";
import type { UseCaseProps } from "@app/components/home/content/Solutions/UseCasesSection";
import type { SolutionSectionAssistantBlockProps } from "@app/components/home/SolutionSection";

// Interface definitions
interface pageSettingsProps {
  uptitle: string;
  title: React.ReactNode;
  description: React.ReactNode;
  from: string;
  to: string;
}

interface HeroProps {
  uptitle: string;
  title: React.ReactNode;
  description: React.ReactNode;
  visuals: {
    src: string;
    alt: string;
    depth: number;
  }[];
  ctaButtons: {
    primary: {
      label: string;
      href: string;
      icon: typeof RocketIcon;
    };
    secondary: {
      label: string;
      href: string;
    };
  };
}

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
};

export const Hero: HeroProps = {
  uptitle: pageSettings.uptitle,
  title: pageSettings.title,
  description: pageSettings.description,
  visuals: [
    {
      src: "/static/landing/sales/sales1.png",
      alt: "Sales Visual 1",
      depth: -30,
    },
    {
      src: "/static/landing/sales/sales2.png",
      alt: "Sales Visual 2",
      depth: -10,
    },
    {
      src: "/static/landing/sales/sales3.png",
      alt: "Sales Visual 3",
      depth: 20,
    },
    {
      src: "/static/landing/sales/sales4.png",
      alt: "Sales Visual 4",
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
      images: ["/static/landing/solutions/analytics1.png"],
    },
    {
      title: "SQL assistant",
      content:
        "Generate, debug and optimize SQL queries that align with your business logic and data models.",
      images: ["/static/landing/solutions/analytics2.png"],
    },
    {
      title: "Data catalog",
      content:
        "Navigate your entire data ecosystem with instant access to schemas and relationships across tables.",
      images: ["/static/landing/solutions/analytics3.png"],
    },
    {
      title: "Data runbooks",
      content:
        "Access and understand data team processes and documentation to streamline operations and troubleshooting.",
      images: ["/static/landing/solutions/analytics4.png"],
    },
  ],
};

export const Quote: QuoteProps = {
  quote:
    "Dust is the most impactful software we've adopted since building Clay. It continuously gets smarter, turning hours of documentation search into instant, cited answers—letting our team spend less time searching and more time closing deals.",
  name: "Everett Berry ",
  title: "Head of GTM Engineering at Clay",
  logo: "/static/landing/logos/clay.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl:
    "https://fast.wistia.net/embed/iframe/0hizroojjb?seo=true&videoFoam=true&captions=on",
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
      "42% of Kyriba employees save 1 to 3 hours weekly leveraging Dust for RFPs.",
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

export const AssistantExamples: SolutionSectionAssistantBlockProps[] = [
  {
    emoji: "🔬",
    name: "@analyst",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Answers advanced data questions on your behalf by writing and executing
        queries and providing visualizations.
      </>
    ),
  },
  {
    emoji: "💬",
    name: "@sqlWriter",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Generates simple SQL queries that understand business logic
        and&nbsp;fixes or&nbsp;improves existing ones
      </>
    ),
  },
  {
    emoji: "🔎",
    name: "@dataCatalog",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Dives into your data model and answers questions about specific changes,
        relationships, business definitions.
      </>
    ),
  },
  {
    emoji: "📈",
    name: "@dataTeamDoc",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Answers questions about internal processes, business definitions
        and&nbsp;runbooks on&nbsp;the data team.
      </>
    ),
  },
];
