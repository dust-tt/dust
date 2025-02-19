import { LightbulbIcon, RocketIcon, UserGroupIcon } from "@dust-tt/sparkle";

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
  uptitle: "Customer Support",
  title: <>Instant knowledge, exceptional support</>,
  from: "from-sky-200",
  to: "to-sky-500",
  description: (
    <>
      Equip your&nbsp;team with AI&nbsp;agents to&nbsp;accelerate issue
      resolution and&nbsp;increase customer satisfaction.
    </>
  ),
};

export const Hero: HeroProps = {
  uptitle: pageSettings.uptitle,
  title: pageSettings.title,
  description: pageSettings.description,
  visuals: [
    {
      src: "/static/landing/support/support1.png",
      alt: "Support Visual 1",
      depth: -30,
    },
    {
      src: "/static/landing/support/support2.png",
      alt: "Support Visual 2",
      depth: -10,
    },
    {
      src: "/static/landing/support/support3.png",
      alt: "Support Visual 3",
      depth: 20,
    },
    {
      src: "/static/landing/support/support4.png",
      alt: "Support Visual 4",
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
  sectionTitle: "Solve faster, satisfy more",
  items: [
    {
      icon: RocketIcon,
      title: "Resolve issues faster",
      description:
        "Surface relevant information from all connected knowledge bases and draft messages in 50+ languages.",
    },
    {
      icon: UserGroupIcon,
      title: "Boost team productivity",
      description:
        "Keep teams in sync with real-time information across all channels and cut onboarding time for new joiners.",
    },
    {
      icon: LightbulbIcon,
      title: "Grasp customer needs",
      description:
        "Convert support interactions into insights, driving data-backed product and documentation improvements.",
    },
  ],
};

export const Metrics: MetricProps = {
  metrics: [
    {
      value: "50%",
      description: <>reduction in ticket resolution time</>,
    },
    {
      value: "6h",
      description: <>saved weekly per agent</>,
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
      title: "Ticket resolution",
      content:
        "Speed up resolution by suggesting tailored responses drawn from your knowledge base and past solutions.",
      images: ["/static/landing/solutions/support1.png"],
    },
    {
      title: "Agent coaching",
      content:
        "Offer feedback to support agents using real-time best practices and ticket insights for consistent, quality service.",
      images: ["/static/landing/solutions/support2.png"],
    },
    {
      title: "Documentation builder",
      content:
        "Convert resolved tickets into searchable articles and FAQs, capturing best practices for future use.",
      images: ["/static/landing/solutions/support3.png"],
    },
    {
      title: "Customer insights",
      content:
        "Identify trends from customer feedback, helping teams proactively improve service and satisfaction.",
      images: ["/static/landing/solutions/support4.png"],
    },
  ],
};

export const Quote: QuoteProps = {
  quote:
    "We're managing a higher volume of tickets and have cut processing time—from an average of 6 minutes per ticket to just a few seconds.",
  name: "Anaïs Ghelfi",
  title: "Head of Data Platform at Malt",
  logo: "/static/landing/logos/malt.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl:
    "https://fast.wistia.net/embed/iframe/r0dwaexoez?seo=true&videoFoam=true&captions=on",
};

export const Stories: CustomerStory[] = [
  {
    title: "Malt cuts support ticket closing time by 50% with Dust",
    content:
      "Malt streamlines customer support using Dust's AI platform for rapid, consistent multilingual responses.",
    href: "https://blog.dust.tt/malt-customer-support/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/12/Malt_Customer_Story_Dust_Support.jpg",
  },
  {
    title: "Pennylane's journey to deploy Dust for Customer Care teams",
    content:
      "Dust evolved from a simple support tool into an integral part of Pennylane's operations.",
    href: "https://blog.dust.tt/pennylane-customer-support-journey/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/12/pennylane_dust_customer_story.png",
  },
  {
    title: "Lifen uses Dust AI agents to boost team productivity",
    content:
      "Lifen uses Dust AI agents to boost team productivity and save hours of work each week.",
    href: "https://blog.dust.tt/customer-story-lifen/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/11/lifen_dust_customer_story.jpg",
  },
];

export const AssistantExamples: SolutionSectionAssistantBlockProps[] = [
  {
    emoji: "🤝",
    backgroundColor: "bg-sky-300",
    name: "@ticketSolver",
    description: (
      <>
        Speeds up resolution by suggesting tailored responses drawn from your
        knowledge base and past solutions.
      </>
    ),
  },
  {
    emoji: "📡",
    backgroundColor: "bg-sky-300",
    name: "@supportAnalyst",
    description: (
      <>
        Offers feedback to support agents using real-time best practices and
        ticket insights for consistent, quality service.
      </>
    ),
  },
  {
    emoji: "🔮",
    backgroundColor: "bg-sky-300",
    name: "@docExpert",
    description: (
      <>
        Converts resolved tickets into searchable articles and FAQs, capturing
        best practices for future use.
      </>
    ),
  },
  {
    emoji: "💡",
    backgroundColor: "bg-sky-300",
    name: "@CSInsights",
    description: (
      <>
        Identifies trends from customer feedback, helping teams proactively
        improve service and satisfaction.
      </>
    ),
  },
];
