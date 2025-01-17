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
      Less busywork,
      <br />
      more deals.
    </>
  ),
  from: "from-emerald-200",
  to: "to-emerald-500",
  description: (
    <>
      Boost qualification, prospecting, and&nbsp;closing. Practice techniques
      from&nbsp;demos to&nbsp;objection handling.
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
  sectionTitle: "Write less, sell more",
  items: [
    {
      icon: MagicIcon,
      title: "Focus on selling",
      description:
        "Maximizing time spent selling, rather than finding, copying or pasting.",
    },
    {
      icon: CheckCircleIcon,
      title: "Raise the odds of closing",
      description:
        "Instantly uncover relevant information about your product and prospects",
    },

    {
      icon: UserGroupIcon,
      title: "Boost team performance",
      description:
        "Give your salespeople actionable feedback from their interactions.",
    },
  ],
};

export const Metrics: MetricProps = {
  metrics: [
    {
      value: "20%",
      description: <>20% more time spent selling at Alan</>,
    },
    {
      value: "5 min",
      description: (
        <>5 minutes to finalize all forms from 3h prior at Watershed</>
      ),
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
      title: "Meeting recaps",
      content:
        "Expedite recaps from meetings or calls, tailoring them to your specific needs.",
      images: ["/static/landing/solutions/sales2.png"],
    },
    {
      title: "Prospect questions",
      content:
        "Address questions or RFPs instantly with concise, up-to-date information.",
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
    "It's pretty miraculous. The assistant answers (correctly!) tons of questions that I used to deal with. It gets the nuance right and cites its sources.",
  name: "Everett Berry ",
  title: "Head of GTM Engineering at Clay",
  logo: "/static/landing/logos/clay.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl:
    "https://fast.wistia.net/embed/iframe/0hizroojjb?seo=true&videoFoam=true",
};

export const Stories: CustomerStory[] = [
  {
    title: "20%+ productivity gains in Sales: Insights from Alan and Payfit",
    content:
      "Dust assistants significantly lowered their acquisition costs, allowing them to hire more salespeople.",
    href: "https://blog.dust.tt/generative-ai-insights-alan-payfit-leaders/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/01/Founder.jpg",
  },
  {
    title: "Kyriba's RFP Assistant for improving pre-sales efficiency",
    content:
      "42% of Kyriba employees save 1 to 3 hours weekly leveraging Dust for RFPs.",
    href: "https://blog.dust.tt/kyriba-accelerating-innovation-with-dust/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/10/kyriba_dust.jpg",
  },
  {
    title: "Lifen uses Dust AI assistants to boost team productivity", // Soon to be replaced with Clay for RFP?
    content:
      "Lifen uses Dust AI assistants to boost team productivity and save hours of work each week.",
    href: "https://blog.dust.tt/customer-story-lifen/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/11/lifen_dust_customer_story.jpg",
  },
];

export const AssistantExamples: SolutionSectionAssistantBlockProps[] = [
  {
    emoji: "🖋️",
    name: "@outboundDraft",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Generates personalized and&nbsp;effective cold emails or&nbsp;follow-up
        emails with the&nbsp;context of&nbsp;the relationship
      </>
    ),
  },
  {
    emoji: "🔎",
    name: "@accountSummary",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Creates a&nbsp;snapshot by&nbsp;retrieving data from&nbsp;your CRM,
        Slack, Notion, including health and&nbsp;sentiment to&nbsp;understand
        where to&nbsp;focus attention
      </>
    ),
  },
  {
    emoji: "📞",
    name: "@callCoach",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Points to&nbsp;battle cards, competitive intelligence,
        and&nbsp;objection handling documentation to&nbsp;increase conversion
      </>
    ),
  },
  {
    emoji: "📊",
    name: "@salesMetrics",
    backgroundColor: "bg-emerald-300",
    description: (
      <>Answers any question on&nbsp;revenue metrics directly from&nbsp;Slack</>
    ),
  },
  {
    emoji: "🔮",
    name: "@salesWisdom",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Processes all call transcripts to&nbsp;extract recurring themes
        or&nbsp;insights
      </>
    ),
  },
  {
    emoji: "🚀",
    name: "@salesShoutout",
    backgroundColor: "bg-emerald-300",
    description: (
      <>
        Highlights performance outliers across the&nbsp;team based on&nbsp;CRM
        data and&nbsp;growth priorities
      </>
    ),
  },
];
