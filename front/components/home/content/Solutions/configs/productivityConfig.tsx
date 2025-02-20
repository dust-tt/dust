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
  uptitle: "Productivity",
  title: <>Get Things Done Faster, Better</>,
  from: "from-violet-200",
  to: "to-violet-500",
  description: (
    <>
      Automate routine tasks, enhance your communications, and get expert
      feedback tied to your company resources.
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
  sectionTitle: "Supercharge your personal productivity and growth",
  items: [
    {
      icon: MagicIcon,
      title: "Focus on impact",
      description:
        "Maximize your time by automating note-taking and content processing.",
    },
    {
      icon: CheckCircleIcon,
      title: "Enhance clarity",
      description:
        "Instantly transform complex information into clear, actionable insights.",
    },
    {
      icon: UserGroupIcon,
      title: "Accelerate growth",
      description:
        "Turn every interaction into a learning opportunity with personalized guidance.",
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
      title: "Meeting assistant",
      content:
        "Convert meeting recordings into structured, actionable summaries within seconds.",
      images: ["/static/landing/solutions/productivity1.png"],
    },
    {
      title: "Content digest",
      content:
        "Transform lengthy documents into clear summaries and key takeaways for quick comprehension.",
      images: ["/static/landing/solutions/productivity2.png"],
    },
    {
      title: "Writing coach",
      content:
        "Enhance your communications with professional polish, improved clarity, and perfect grammar.",
      images: ["/static/landing/solutions/productivity3.png"],
    },
    {
      title: "Personal mentor",
      content:
        "Access expert guidance and deep insights across any skill or knowledge domain.",
      images: ["/static/landing/solutions/productivity4.png"],
    },
  ],
};

export const Quote: QuoteProps = {
  quote:
    "The Dust platform is more than just a tool for post-ideation; it's a catalyst for innovation, stimulating idea generation as employees engage with it.",
  name: "Boris Lipiainen",
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
    emoji: "🎯",
    name: "@meetingNotes",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Transforms your meeting recordings into structured summaries with clear
        action items and key points.
      </>
    ),
  },
  {
    emoji: "📚",
    name: "@docSummary",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Converts long documents into concise summaries and bullet points for
        faster understanding.
      </>
    ),
  },
  {
    emoji: "✍️",
    name: "@writeWell",
    backgroundColor: "bg-sky-300",
    description: (
      <>
        Polishes your writing with improved clarity, professional tone, and
        perfect grammar.
      </>
    ),
  },
  {
    emoji: "🎓",
    name: "@personalCoach",
    backgroundColor: "bg-sky-300",
    description: (
      <>Provides expert guidance and detailed insights on your work.</>
    ),
  },
];
