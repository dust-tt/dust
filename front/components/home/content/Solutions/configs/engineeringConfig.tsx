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
import type { SolutionSectionAssistantBlockProps } from "@app/components/home/SolutionSection";

// Config exports
export const pageSettings: pageSettingsProps = {
  uptitle: "Engineering",
  title: <>Ship Better Code, Reduce Interruptions</>,
  from: "from-blue-200",
  to: "to-blue-500",
  description: (
    <>
      Streamline incident response, automate documentation, and keep your team
      focused on building.
    </>
  ),
  bulletPoints: [
    "Get real-time coding support and troubleshooting",
    "Speed up incident resolution and communication",
    "Create instant team updates",
    "Surface relevant context and solutions from past incidents",
  ],
  image: "/static/landing/carouselImages/engineering.png",
};

export const Hero: HeroProps = {
  uptitle: pageSettings.uptitle,
  title: pageSettings.title,
  description: pageSettings.description,
  visuals: [
    {
      src: "/static/landing/engineering/eng1.png",
      alt: "Engineering Visual 1",
      depth: -30,
    },
    {
      src: "/static/landing/engineering/eng2.png",
      alt: "Engineering Visual 2",
      depth: -10,
    },
    {
      src: "/static/landing/engineering/eng3.png",
      alt: "Engineering Visual 3",
      depth: 20,
    },
    {
      src: "/static/landing/engineering/eng4.png",
      alt: "Engineering Visual 4",
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
  sectionTitle: "Amplify your engineering team's capabilities ",
  items: [
    {
      icon: MagicIcon,
      title: "Focus on building",
      description:
        "Maximize engineering time by automating documentation and support tasks.",
    },
    {
      icon: CheckCircleIcon,
      title: "Streamline incident handling",
      description:
        "Instantly surface relevant context and solutions to resolve issues faster.",
    },

    {
      icon: UserGroupIcon,
      title: "Facilitate team operations",
      description: "Focus on coding, not writing updates or pull requests.",
    },
  ],
};

export const Metrics: MetricProps = {
  metrics: [
    {
      value: "20%",
      description: <>faster project completion at Alan</>,
    },
    {
      value: "2h",
      description: <> saved per incident</>,
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
      title: "First responder",
      content:
        "Fix code errors by retrieving internal documentation, updates, and Slack discussions. Stay focused on your core work.",
      images: ["/static/landing/solutions/eng1.png"],
    },
    {
      title: "Incident handling",
      content:
        "Search runbooks and past incidents to speed up resolution, while automatically generating reports and communications.",
      images: ["/static/landing/solutions/eng2.png"],
    },
    {
      title: "Team updates",
      content:
        "Generate concise summaries of code changes, incidents, and technical discussions to keep everyone aligned.",
      images: ["/static/landing/solutions/eng3.png"],
    },
    {
      title: "External doc parser",
      content:
        "Chat with any technical documentation to quickly find answers and follow step-by-step guidance.",
      images: ["/static/landing/solutions/eng4.png"],
    },
  ],
};

export const Quote: QuoteProps = {
  quote:
    "It's really become a reflex now to ask a Dust agent. With just two keystrokes, it instantly surfaces exactly the context I need - whether from code, documentation, or overlooked team discussions.",
  name: "Vincent Delagabbe",
  title: "Software Engineer at Alan",
  logo: "/static/landing/logos/alan.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl:
    "https://fast.wistia.net/embed/iframe/0hizroojjb?seo=true&videoFoam=true&captions=on",
};

export const Stories: CustomerStory[] = [
  {
    title: "Alan's engineering team speeds up projects 20% with Dust",
    content:
      "Alan uses Dust to improve efficiency in the context of an expanding codebase and documentation.",
    href: "https://blog.dust.tt/integrating-ai-workflows-alan/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_alan-1.png",
  },
  // {
  //   title: "November Five's journey to minimizing routine tasks with Dust",
  //   content:
  //     "Discover how November Five accelerates work with Dust, turning 3-hour tasks into 30 minutes.",
  //   href: "https://blog.dust.tt/november-five-ai-transformation-dust/",
  //   src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_november_five.png",
  // },
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
    emoji: "👨‍💻",
    name: "@engHelp",
    backgroundColor: "bg-blue-300",
    description: (
      <>
        Answers questions from&nbsp;the rest of&nbsp;the company
        on&nbsp;engineering definitions, ongoing projects, and&nbsp;who's
        on&nbsp;run
      </>
    ),
  },
  {
    emoji: "🚨",
    name: "@incidentsCopilot",
    backgroundColor: "bg-blue-300",
    description: (
      <>
        Assists in&nbsp;the event of&nbsp;an incident with data on&nbsp;previous
        similar situation and&nbsp;their remediation
      </>
    ),
  },
  {
    emoji: "📡",
    name: "@engWeekly",
    backgroundColor: "bg-blue-300",
    description: (
      <>
        Writes a&nbsp;table of&nbsp;shipped and&nbsp;unshipped
        features—Summarizes incidents with impact, current status,
        and&nbsp;remediation plans
      </>
    ),
  },
  {
    emoji: "📚",
    name: "@docDigest",
    backgroundColor: "bg-blue-300",
    description: (
      <>Parses external documentation and helps you digest how to use it.</>
    ),
  },
];
