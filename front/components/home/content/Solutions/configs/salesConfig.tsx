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
  uptitle: "Sales",
  title: (
    <>
      Smart automations, <br></br>more deals
    </>
  ),
  from: "from-emerald-200",
  to: "to-emerald-500",
  description: (
    <>
      Optimize every touchpoint, automate administrative overhead, and close
      deals faster.
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
  sectionTitle: "Elevate your sales reps to new possibilities ",
  items: [
    {
      icon: MagicIcon,
      title: "Focus on selling",
      description:
        "Maximize selling time by automating admin tasks and data entry.",
    },
    {
      icon: CheckCircleIcon,
      title: "Raise the odds of closing",
      description:
        "Instantly uncover relevant product or prospect insights to deliver personalized responses",
    },

    {
      icon: UserGroupIcon,
      title: "Boost team performance",
      description:
        "Turn every rep into a top performer by sharing feedback and best practices.",
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
      title: "Account snapshot",
      content:
        "Create account summaries with key historical interactions, wherever they live.",
      images: ["/static/landing/solutions/sales1.png"],
    },
    {
      title: "Meeting follow-ups",
      content:
        "Convert call transcripts into custom recaps and follow-up emails, enriched with prospect data.",
      images: ["/static/landing/solutions/sales2.png"],
    },
    {
      title: "Prospect questions",
      content:
        "Auto-complete security forms & RFPs with up-to-date company information.",
      images: ["/static/landing/solutions/sales3.png"],
    },
    {
      title: "Sales coaching",
      content:
        "Parse call transcripts to coach salespeople on their pitch and understand where deals fail.",
      images: ["/static/landing/solutions/sales4.png"],
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
    emoji: "📊",
    name: "@accountSnapshot",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Creates comprehensive account summaries by aggregating key historical
        interactions from multiple data sources
      </>
    ),
  },
  {
    emoji: "📝",
    name: "@meetingRecap",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Automatically generates customized meeting summaries and follow-up
        emails from call transcripts with enriched prospect information
      </>
    ),
  },
  {
    emoji: "📋",
    name: "@prospectHelper",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Streamlines response process for security questionnaires and RFPs by
        auto-populating with current company data
      </>
    ),
  },
  {
    emoji: "🎯",
    name: "@salesCoach",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Analyzes call transcripts to provide pitch optimization feedback and
        identify patterns in deal outcomes
      </>
    ),
  },
];
