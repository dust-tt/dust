import { LightbulbIcon, RocketIcon, UserGroupIcon } from "@dust-tt/sparkle";
import type {
  Benefits,
  MetricProps,
} from "@app/components/home/content/Solutions/BenefitsSection";
import type {
  CustomerStory,
  QuoteProps,
} from "@app/components/home/content/Solutions/CustomerStoriesSection";
import type { DemoVideo } from "@app/components/home/content/Solutions/DemoVideoSection";
import type { UseCase } from "@app/components/home/content/Solutions/UseCasesSection";
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
      Equip your&nbsp;team with AI&nbsp;assistants to&nbsp;accelerate issue
      resolution and&nbsp;increase customer satisfaction.
    </>
  ),
};

export const supportHeroProps: HeroProps = {
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

export const supportBenefits: Benefits = {
  sectionTitle: "Solve faster, satisfy more",
  items: [
    {
      icon: RocketIcon,
      title: "Resolve Issues Faster",
      description:
        "Surface relevant information from all connected knowledge bases and draft messages in 50+ languages.",
    },
    {
      icon: UserGroupIcon,
      title: "Boost Team Productivity",
      description:
        "Keep teams in sync with real-time information across all channels and cut onboarding time for new joiners.",
    },
    {
      icon: LightbulbIcon,
      title: "Grasp Customer Needs",
      description:
        "Convert support interactions into insights, driving data-backed product and documentation improvements.",
    },
  ],
};

export const supportMetrics: MetricProps = {
  metrics: [
    {
      value: "50%",
      description: <>50% in ticket resolution time</>,
    },
    {
      value: "8h",
      description: <>8 hours saved weekly per agent</>,
    },
  ],
  from: "from-amber-200",
  to: "to-amber-500",
};

export const supportUseCases: UseCase = {
  sectionTitle: "Your use cases, your way",
  sectionDescription:
    "Customize and automate tasks without writing a single line of code.",
  items: [
    {
      title: "Ticket Resolution",
      content:
        "Accelerate response times with dynamic answer suggestions and contextual knowledge at every step.",
      images: ["/static/landing/solutions/support1.png"],
    },
    {
      title: "Agent Coaching",
      content:
        "Offer feedback to support agents using real-time best practices and ticket insights for consistent, quality service.",
      images: ["/static/landing/solutions/support2.png"],
    },
    {
      title: "Documentation Builder",
      content:
        "Convert resolved tickets into searchable articles and FAQs, capturing best practices for future use.",
      images: ["/static/landing/solutions/support3.png"],
    },
    {
      title: "Customer Insights",
      content:
        "Identify trends from customer feedback, helping teams proactively improve service and satisfaction.",
      images: ["/static/landing/solutions/support4.png"],
    },
  ],
};

export const supportQuote: QuoteProps = {
  quote:
    "We're managing a higher volume of tickets and have cut processing time—from an average of 6 minutes per ticket to just a few seconds.",
  name: "Anaïs Ghelfi",
  title: "Head of Data Platform at Malt",
  logo: "/static/landing/logos/malt.png",
};

export const supportDemoVideo: DemoVideo = {
  sectionTitle: "Watch Dust work",
  videoUrl:
    "https://fast.wistia.net/embed/iframe/r0dwaexoez?seo=true&videoFoam=true",
};

export const supportStories: CustomerStory[] = [
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
    href: "https://blog.dust.tt/pennylane-dust-customer-support-journey/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/12/pennylane_dust_customer_story.png",
  },
  {
    title: "Lifen uses Dust AI assistants to boost team productivity",
    content:
      "Lifen uses Dust AI assistants to boost team productivity and save hours of work each week.",
    href: "https://blog.dust.tt/customer-story-lifen/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/11/lifen_dust_customer_story.jpg",
  },
];

export const supportAssistantExamples: SolutionSectionAssistantBlockProps[] = [
  {
    emoji: "🤝",
    backgroundColor: "bg-sky-300",
    name: "@supportExpert",
    description: (
      <>
        Surfaces relevant information from&nbsp;your Help Center, FAQs,
        knowledge base, online documentation, and&nbsp;tickets. Understands
        errors codes without help from&nbsp;the tech&nbsp;team
      </>
    ),
  },
  {
    emoji: "📡",
    backgroundColor: "bg-sky-300",
    name: "@productInfo",
    description: (
      <>
        Answer questions on&nbsp;product evolutions, engineering activity,
        alerts, and&nbsp;downtime
      </>
    ),
  },
  {
    emoji: "🔮",
    backgroundColor: "bg-sky-300",
    name: "@supportAnalyst",
    description: (
      <>
        Identifies patterns and&nbsp;sentiment in&nbsp;support interactions
        to&nbsp;highlight recurring needs and&nbsp;actionable initiatives based
        on&nbsp;the internal product team nomenclature and&nbsp;infrastructure
      </>
    ),
  },
  {
    emoji: "💡",
    backgroundColor: "bg-sky-300",
    name: "@supportOnboarding",
    description: (
      <>
        Helps new members of&nbsp;the support team navigate the&nbsp;tools
        and&nbsp;processes in&nbsp;their first weeks to&nbsp;set them up for
        success
      </>
    ),
  },
  {
    emoji: "🚨",
    backgroundColor: "bg-sky-300",
    name: "@supportAlerts",
    description: (
      <>
        Connects to&nbsp;product and&nbsp;engineering communication channels
        to&nbsp;surface ongoing engineering activity, incidents or&nbsp;issues
        and&nbsp;highlight the&nbsp;possible impact on&nbsp;users
        and&nbsp;customers
      </>
    ),
  },
  {
    emoji: "😳",
    backgroundColor: "bg-sky-300",
    name: "@whatWouldUserDo",
    description: (
      <>
        Crafts training, product documentation and&nbsp;training materials
        through the&nbsp;eyes of&nbsp;your users to&nbsp;help improve content
        ahead of&nbsp;issues
      </>
    ),
  },
];
