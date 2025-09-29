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
  ROIProps,
} from "@app/components/home/content/Solutions/configs/utils";
import type {
  CustomerStory,
  QuoteProps,
} from "@app/components/home/content/Solutions/CustomerStoriesSection";
import type { DemoVideoProps } from "@app/components/home/content/Solutions/DemoVideoSection";
import type { UseCaseProps } from "@app/components/home/content/Solutions/UseCasesSection";

// Config exports
export const pageSettings: pageSettingsProps = {
  uptitle: "Engineering",
  title: <>Ship Better Code, Reduce Interruptions</>,
  accentColor: "text-brand-electric-blue",
  description: (
    <>
      Streamline incident response, automate documentation, and keep your team
      focused on building.
    </>
  ),
  bulletPoints: [
    "Get coding support and troubleshooting with relevant context.",
    "Speed up incident resolution and communication.",
    "Create instant team updates.",
    "Surface relevant context and solutions from past incidents.",
  ],
  image: "/static/landing/engineering/incidentHandling.png",
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
  color: "golden",
};

export const UseCases: UseCaseProps = {
  sectionTitle: "Your use cases, your way",
  sectionDescription:
    "Customize and automate tasks without writing a single line of code.",
  items: [
    {
      title: "Code debugging",
      content:
        "Streamline debugging within your IDE by surfacing relevant code context, documentation, and recent issues.",
      images: ["/static/landing/engineering/debuggingAgent.png"],
    },
    {
      title: "Incident handling",
      content:
        "Search runbooks and past incidents to speed up resolution, while automatically generating reports and communications.",
      images: ["/static/landing/engineering/incidentHandling.png"],
    },
    {
      title: "Code review",
      content:
        "Automate code reviews to maintain engineering standards and security at scale.",
      images: ["/static/landing/engineering/autoreview.png"],
    },
    {
      title: "Code to doc",
      content:
        "Generate and maintain technical and external-facing documentation automatically from code changes.",
      images: ["/static/landing/engineering/teamUpdates.png"],
    },
  ],
};

const ROI: ROIProps = {
  number: "20%",
  subtitle: "faster project completion",
  logo: "/static/landing/logos/gray/alan.png",
};

export const Quote: QuoteProps = {
  quote:
    "It's really become a reflex now to ask a Dust agent. With just two keystrokes, it instantly surfaces exactly the context I need - whether from code, documentation, or overlooked team discussions.",
  name: "Vincent Delagabbe",
  title: "Software Engineer at Alan",
  logo: "/static/landing/logos/color/alan.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl: "https://fast.wistia.net/embed/iframe/6z5rtwsuvo",
  showCaptions: true,
};

export const Stories: CustomerStory[] = [
  {
    title: "Alan's engineering team speeds up projects 20% with Dust",
    content:
      "Alan uses Dust to improve efficiency in the context of an expanding codebase and documentation.",
    href: "https://blog.dust.tt/integrating-ai-workflows-alan/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Alan-__-Dust-1--1--1.png",
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
