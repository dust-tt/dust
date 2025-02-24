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
  uptitle: "Marketing",
  title: <>Create On-Brand Content At Scale</>,
  from: "from-amber-200",
  to: "to-amber-500",
  description: (
    <>
      Scale content production, maintain brand consistency, and optimize reach
      across channels.
    </>
  ),
};

export const Hero: HeroProps = {
  uptitle: pageSettings.uptitle,
  title: pageSettings.title,
  description: pageSettings.description,
  visuals: [
    {
      src: "/static/landing/marketing/marketing1.png",
      alt: "Marketing Visual 1",
      depth: -30,
    },
    {
      src: "/static/landing/marketing/marketing2.png",
      alt: "Marketing Visual 2",
      depth: -10,
    },
    {
      src: "/static/landing/marketing/marketing3.png",
      alt: "Marketing Visual 3",
      depth: 20,
    },
    {
      src: "/static/landing/marketing/marketing4.png",
      alt: "Marketing Visual 4",
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
  sectionTitle: "Elevate your content strategy to new heights",
  items: [
    {
      icon: MagicIcon,
      title: "Focus on strategy",
      description:
        "Maximize impact by automating content creation and optimization tasks.",
    },
    {
      icon: CheckCircleIcon,
      title: "Ensure consistency",
      description:
        "Maintain perfect brand alignment across all content and communication channels.",
    },
    {
      icon: UserGroupIcon,
      title: "Scale production",
      description:
        "Transform your content workflow into an efficient, brand-compliant machine.",
    },
  ],
};

export const Metrics: MetricProps = {
  metrics: [
    {
      value: "70%",
      description: <>time reduction in localization</>,
    },
    {
      value: "5X",
      description: <> brand-compliant copy generation</>,
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
      title: "Content localization",
      content:
        "Translate and adapt content across languages while maintaining brand voice and cultural relevance.",
      images: ["/static/landing/solutions/content1.png"],
    },
    {
      title: "Content optimization",
      content:
        "Transform raw content into polished, SEO-optimized pieces that align with brand guidelines.",
      images: ["/static/landing/solutions/content2.png"],
    },
    {
      title: "Brand copywriting",
      content:
        "Create engaging UX and social media content that consistently reflects your brand identity.",
      images: ["/static/landing/solutions/content3.png"],
    },
    {
      title: "Market Intelligence",
      content:
        "Monitor market movements and competitor activities to inform your content strategy.",
      images: ["/static/landing/solutions/content4.png"],
    },
  ],
};

export const Quote: QuoteProps = {
  quote:
    "Dust is not just a tool - it's like having an extra team member who knows your brand voice, can handle recurring tasks, and helps you tackle new challenges. I couldn't do half of my job without it, especially with tight deadlines and a small team.",
  name: "Valentine Chelius",
  title: "Head of Marketing at Fleet",
  logo: "/static/landing/logos/fleet.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl:
    "https://fast.wistia.net/embed/iframe/0hizroojjb?seo=true&videoFoam=true&captions=on",
};

export const Stories: CustomerStory[] = [
  {
    title: "How Qonto Achieved 70% Faster Localization with Dust",
    content:
      "Qonto's Tolki assistant serves as a virtual polyglot, helping the content team localize content while maintaining brand voice and regional standards.",
    href: "https://blog.dust.tt/qonto-dust-ai-partnership/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_qonto.png",
  },
  {
    title: "Building a Marketing Engine from Scratch at Fleet",
    content:
      "With just two interns, Valentine created a scalable marketing operation using Dust's AI capabilities for content and brand management.",
    href: "https://blog.dust.tt/how-valentine-head-of-marketing-at-fleet-uses-dust/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_fleet.png",
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
    emoji: "🖋️",
    name: "@contentWriter",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Creates content based on best-in class &nbsp;examples availble
        internally
      </>
    ),
  },
  {
    emoji: "🖇️",
    name: "@socialPost",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Generates versioned&nbsp;content for social media outlets taking into
        account company guidelines
      </>
    ),
  },
  {
    emoji: "♠️",
    name: "@battleCard",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Generates arguments for your product in comparison to a specific
        competitor, in line with internal product guidelines and category
        positioning
      </>
    ),
  },
  {
    emoji: "🌍",
    name: "@internationalizer",
    backgroundColor: "bg-amber-300",
    description: (
      <>
        Transcreate all your content to adapt content for international markets
      </>
    ),
  },
];
