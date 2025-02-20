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
  uptitle: "Legal",
  title: <>Accelerate Legal Operations and Compliance</>,
  from: "from-sky-200",
  to: "to-sky-500",
  description: (
    <>
      Assist your teams on legal or compliance reviews, and make legal support
      more self-served across your organization.
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
  sectionTitle: "Transform your legal operations into strategic advantage",
  items: [
    {
      icon: MagicIcon,
      title: "Focus on expertise",
      description:
        "Maximize lawyer time by automating routine legal guidance and reviews.",
    },
    {
      icon: CheckCircleIcon,
      title: "Ensure compliance",
      description:
        "Instantly verify requirements and stay current with regulatory changes.",
    },
    {
      icon: UserGroupIcon,
      title: "Scale legal support",
      description:
        "Turn legal expertise into accessible guidance for the entire organization.",
    },
  ],
};

export const Metrics: MetricProps = {
  metrics: [
    {
      value: "50%",
      description: <>time saved on legal reviews</>,
    },
    // {
    //   value: "1h",
    //   description: <> saved per review</>,
    // },
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
      title: "Legal helpdesk",
      content:
        "Provide instant legal guidance and answers using your approved policies and documentation.",
      images: ["/static/landing/solutions/legal1.png"],
    },
    {
      title: "Contract review",
      content:
        "Analyze contracts automatically for compliance and risk, highlighting key terms and obligations.",
      images: ["/static/landing/solutions/legal2.png"],
    },
    {
      title: "Regulatory Change Management",
      content:
        "Search through case law and monitor regulatory updates to ensure ongoing compliance.",
      images: ["/static/landing/solutions/legal3.png"],
    },
    {
      title: "Document creation",
      content:
        "Generate legal documents and agreements using pre-approved templates and clauses.",
      images: ["/static/landing/solutions/legal4.png"],
    },
  ],
};

export const Quote: QuoteProps = {
  quote:
    "Dust transformed our privacy reviews. It handles compliance checks, suggests improvements, and drafts communications. While I maintain final oversight, it both cuts our review time and helps pressure-test our legal interpretations.",
  name: "Thomas Adhumeau",
  title: "Chief Privacy Officer at Didomi",
  logo: "/static/landing/logos/didomi.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl:
    "https://fast.wistia.net/embed/iframe/0hizroojjb?seo=true&videoFoam=true&captions=on",
};

export const Stories: CustomerStory[] = [
  {
    title:
      "50% Time Savings in Legal: How Didomi's CPO Transformed Privacy Compliance",
    content:
      "Dust AI agents cut their legal team's workload in half, enabling them to scale operations across multiple countries without additional headcount.",
    href: "https://blog.dust.tt/how-thomas-uses-ai-assistants-to-manage-legal-and-data-privacy-at-didomi/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_didomi.png",
  },
  {
    title:
      "50,000 Hours Saved: How Qonto Revolutionized Compliance and Risk Assessment with AI",
    content:
      "Germi, Qonto's AI assistant, analyzes German industry codes and screens prohibited activities, automating compliance checks across European markets.",
    href: "https://blog.dust.tt/qonto-dust-ai-partnership/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_qonto.png",
  },
  // {
  //   title: "Lifen uses Dust AI agents to boost team productivity", // Soon to be replaced with Clay for RFP?
  //   content:
  //     "Lifen uses Dust AI agents to boost team productivity and save hours of work each week.",
  //   href: "https://blog.dust.tt/customer-story-lifen/",
  //   src: "https://blog.dust.tt/content/images/size/w2000/2024/11/lifen_dust_customer_story.jpg",
  // },
];

export const AssistantExamples: SolutionSectionAssistantBlockProps[] = [
  {
    emoji: "⚖️",
    name: "@legalHelp",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Provides instant answers to legal questions using your approved policies
        and internal documentation.
      </>
    ),
  },
  {
    emoji: "📝",
    name: "@contractReview",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Reviews contracts automatically, highlighting key terms and potential
        compliance risks.
      </>
    ),
  },
  {
    emoji: "🔍",
    name: "@legalResearch",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Searches through case law and tracks regulatory changes to keep you
        compliant and informed.
      </>
    ),
  },
  {
    emoji: "📄",
    name: "@legalDocBuilder",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Creates legal documents and agreements using your pre-approved templates
        and clauses.
      </>
    ),
  },
];
