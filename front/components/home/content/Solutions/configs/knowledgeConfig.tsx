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
  uptitle: "Knowledge",
  title: <>Make Company Knowledge Instantly Accessible.</>,
  from: "from-emerald-200",
  to: "to-emerald-500",
  description: (
    <>
      Transform organizational knowledge into structured insights and empower
      teams with instant access to precise information.
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
  sectionTitle: "Transform your company knowledge into actionable intelligence",
  items: [
    {
      icon: MagicIcon,
      title: "Drop tribal knowledge",
      description:
        "Maximize productivity by making all company knowledge instantly accessible.",
    },
    {
      icon: CheckCircleIcon,
      title: "Accelerate learning",
      description:
        "Turn scattered information into organized, searchable knowledge for everyone.",
    },
    {
      icon: UserGroupIcon,
      title: "Scale expertise",
      description:
        "Make every team member an expert with instant access to collective knowledge.",
    },
  ],
};

export const Metrics: MetricProps = {
  metrics: [
    {
      value: "90%",
      description: <>weekly users at Alan</>,
    },
    {
      value: "43%",
      description: <>of Kyriba employees save more than 3 hours weekly</>,
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
      title: "Team knowledge",
      content:
        "Answer employee questions instantly across departments using internal documentation and policies.",
      images: ["/static/landing/solutions/knowledge1.png"],
    },
    {
      title: "Product expert",
      content:
        "Provide comprehensive product information and documentation support to all employees.",
      images: ["/static/landing/solutions/knowledge2.png"],
    },
    {
      title: "Activity digests",
      content:
        "Generate automated summaries of company activities, discussions, and project status updates.",
      images: ["/static/landing/solutions/knowledge3.png"],
    },
    {
      title: "Market intelligence",
      content:
        "Track and structure relevant market information into actionable insights and custom reports.",
      images: ["/static/landing/solutions/knowledge4.png"],
    },
  ],
};

export const Quote: QuoteProps = {
  quote:
    "It became evident that Dust could serve as a powerful co-pilot for both onboarding new employees and supporting long-term staff across all functions. Everyone leverages Dust as a knowledgeable buddy to enhance their productivity and efficiency.",
  name: "Boris Lipiainen ",
  title: "Chief Product and Technology Officer at Kyriba",
  logo: "/static/landing/logos/kyriba.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl:
    "https://fast.wistia.net/embed/iframe/0hizroojjb?seo=true&videoFoam=true&captions=on",
};

export const Stories: CustomerStory[] = [
  {
    title: "Kyriba's adoption of Dust across all functions",
    content:
      "43% of Kyriba employees save more than 3 hours weekly leveraging Dust for RFPs.",
    href: "https://blog.dust.tt/kyriba-accelerating-innovation-with-dust/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/10/kyriba_dust.jpg",
  },
  {
    title:
      "PayFit Accelerates Content Creation and Knowledge Sharing with Dust",
    content:
      "PayFit leverages Dust AI assistants to improve their internal processes across the board.",
    href: "https://blog.dust.tt/dust-ai-payfit-efficiency/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_payfit.png",
  },
  {
    title: "November Five's journey to minimizing routine tasks with Dust",
    content:
      "Discover how November Five accelerates work with Dust, turning 3-hour tasks into 30 minutes.",
    href: "https://blog.dust.tt/november-five-ai-transformation-dust/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_november_five.png",
  },
];

export const AssistantExamples: SolutionSectionAssistantBlockProps[] = [
  {
    emoji: "📚",
    name: "@companyGuide",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Answers questions about company policies, processes, and documentation
        across all departments.
      </>
    ),
  },
  {
    emoji: "📱",
    name: "@productExpert",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Provides instant answers about product features, documentation, and
        technical specifications.
      </>
    ),
  },
  {
    emoji: "📡",
    name: "@activityRadar",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Creates daily and weekly digests of key company activities, project
        updates, and team discussions.
      </>
    ),
  },
  {
    emoji: "🔍",
    name: "@marketResearch",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Tracks competitor activities and market trends, delivering structured
        insights and regular reports.
      </>
    ),
  },
];
