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
  uptitle: "IT",
  title: <>Automate Support, Empower Employees</>,
  from: "from-cyan-200",
  to: "to-cyan-500",
  description: (
    <>
      Scale IT support, automate routine requests, and keep your organization
      running smoothly.
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
  sectionTitle: "Transform your IT support into a self-service powerhouse",
  items: [
    {
      icon: MagicIcon,
      title: "Focus on complex tasks",
      description:
        "Maximize IT team efficiency by automating routine support requests.",
    },
    {
      icon: CheckCircleIcon,
      title: "Speed up resolution",
      description:
        "Instantly provide accurate solutions using your documented knowledge base.",
    },
    {
      icon: UserGroupIcon,
      title: "Empower employees",
      description:
        "Turn IT support into a self-service experience that scales across the organization.",
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
      title: "IT helpdesk",
      content:
        "Answer common employee IT questions instantly using your internal documentation and policies.",
      images: ["/static/landing/solutions/it1.png"],
    },
    {
      title: "IT ops assistant",
      content:
        "Support system administrators with troubleshooting guidance based on your documented procedures.",
      images: ["/static/landing/solutions/it2.png"],
    },
    {
      title: "Procurement helper",
      content:
        "Guide employees through procurement processes and requirements with automated assistance.",
      images: ["/static/landing/solutions/it3.png"],
    },
    {
      title: "Ticket analytics",
      content:
        "Analyze support patterns to identify improvement opportunities and optimize documentation.",
      images: ["/static/landing/solutions/it4.png"],
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
    emoji: "🔧",
    name: "@itHelp",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Answers common IT questions and troubleshooting needs using your
        internal documentation.
      </>
    ),
  },
  {
    emoji: "🚨",
    name: "@opsGuide",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Assists system administrators with technical troubleshooting and
        infrastructure support.
      </>
    ),
  },
  {
    emoji: "💳",
    name: "@procureHelp",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Guides employees through procurement processes and requirements step by
        step.
      </>
    ),
  },
  {
    emoji: "📊",
    name: "@ticketInsights",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Analyzes support patterns to identify common issues and improvement
        opportunities.
      </>
    ),
  },
];
