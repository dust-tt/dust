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

// Config exports
export const pageSettings: pageSettingsProps = {
  uptitle: "IT",
  title: <>Automate Support, Empower Employees</>,
  accentColor: "text-brand-orange-golden",
  description: (
    <>
      Scale IT support, automate routine requests, and keep your IT desk clean.
    </>
  ),
  bulletPoints: [
    "Answer employee IT questions instantly.",
    "Guide system administrators through troubleshooting.",
    "Streamline procurement processes.",
    "Surface IT trends for proactive improvements.",
  ],
  image: "/static/landing/it/itHelpdesk.png",
};

export const Hero: HeroProps = {
  uptitle: pageSettings.uptitle,
  title: pageSettings.title,
  description: pageSettings.description,
  visuals: [
    {
      src: "/static/landing/it/it1.png",
      alt: "IT Visual 1",
      depth: -30,
    },
    {
      src: "/static/landing/it/it2.png",
      alt: "IT Visual 2",
      depth: -10,
    },
    {
      src: "/static/landing/it/it3.png",
      alt: "IT Visual 3",
      depth: 20,
    },
    {
      src: "/static/landing/it/it4.png",
      alt: "IT Visual 4",
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
  sectionTitle: "Create IT agents that knows your systems inside out",
  items: [
    {
      icon: MagicIcon,
      title: "Focus on complex tasks",
      description:
        "Maximize IT team efficiency by automating routine support requests.",
    },
    {
      icon: CheckCircleIcon,
      title: "Speed up resolution",
      description:
        "Instantly provide accurate solutions using your documented knowledge base.",
    },
    {
      icon: UserGroupIcon,
      title: "Empower employees",
      description:
        "Turn IT support into a self-service experience that scales across the organization.",
    },
  ],
};

export const Metrics: MetricProps = {
  metrics: [
    {
      value: "30%",
      description: (
        <>
          Fewer IT
          <br />
          tickets
        </>
      ),
    },
    {
      value: "4h",
      description: (
        <>
          {" "}
          Saved weekly
          <br />
          filling RFP
        </>
      ),
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
      title: "IT helpdesk",
      content:
        "Answer common employee IT questions instantly using your internal documentation and policies.",
      images: ["/static/landing/it/itHelpdesk.png"],
    },
    {
      title: "IT ops assistant",
      content:
        "Support system administrators with troubleshooting guidance based on your documented procedures.",
      images: ["/static/landing/it/itOps.png"],
    },
    {
      title: "Procurement helper",
      content:
        "Guide employees through procurement processes and requirements with automated assistance.",
      images: ["/static/landing/it/procureHelp.png"],
    },
    {
      title: "Ticket analytics",
      content:
        "Analyze support patterns to identify improvement opportunities and optimize documentation.",
      images: ["/static/landing/it/itInsights.png"],
    },
  ],
};

export const Quote: QuoteProps = {
  quote:
    "One of the things that impressed me about Dust is that all the use cases around internal and external support for teams who need to maintain processes are impressive. Being able to call an agent that parses all the knowledge is a huge pain reliever.",
  name: "Raphael Brousse ",
  title: "VP Operations at Lifen",
  logo: "/static/landing/logos/color/lifen.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl: "https://fast.wistia.net/embed/iframe/4a4bjtxdpf",
  showCaptions: true,
};

const Stories: CustomerStory[] = [
  {
    title: "Lifen Saves Two Hours per Week per Employee with Dust", // Soon to be replaced with Clay for RFP?
    content:
      "Lifen uses Dust AI agents to boost team productivity and save hours of work each week.",
    href: "https://blog.dust.tt/customer-story-lifen/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/11/lifen_dust_customer_story.jpg",
  },
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
      "43% of Kyriba employees save more than 3 hours weekly leveraging Dust for RFPs.",
    href: "https://blog.dust.tt/kyriba-accelerating-innovation-with-dust/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/10/kyriba_dust.jpg",
  },
];
