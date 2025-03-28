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
  uptitle: "Knowledge",
  title: <>Make Company Knowledge Instantly Accessible.</>,
  accentColor: "text-brand-hunter-green",
  description: (
    <>
      Transform organizational knowledge into structured insights and empower
      teams with instant access to precise information.
    </>
  ),
  bulletPoints: [
    "Access company-wide knowledge instantly",
    "Find product information across knowledge bases",
    "Get answers in Slack with relevant context and citations",
    "Surface blockers from project discussions",
  ],
  image: "/static/landing/knowledge/askacme.png",
};

export const Hero: HeroProps = {
  uptitle: pageSettings.uptitle,
  title: pageSettings.title,
  description: pageSettings.description,
  visuals: [
    {
      src: "/static/landing/knowledge/knowledge1.png",
      alt: "Knowledge Visual 1",
      depth: -30,
    },
    {
      src: "/static/landing/knowledge/knowledge2.png",
      alt: "Knowledge Visual 2",
      depth: -10,
    },
    {
      src: "/static/landing/knowledge/knowledge3.png",
      alt: "Knowledge Visual 3",
      depth: 20,
    },
    {
      src: "/static/landing/knowledge/knowledge4.png",
      alt: "Knowledge Visual 4",
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
};

export const UseCases: UseCaseProps = {
  sectionTitle: "Your use cases, your way",
  sectionDescription:
    "Customize and automate tasks without writing a single line of code.",
  items: [
    {
      title: "Team knowledge",
      content:
        "Uncover tribal knowledge and answer employee questions with internal documentation and communication.",
      images: ["/static/landing/knowledge/askacme.png"],
    },
    {
      title: "Product expert",
      content:
        "Provide comprehensive product information and documentation support to all employees.",
      images: ["/static/landing/knowledge/productexpert.png"],
    },
    {
      title: "Activity digests",
      content:
        "Generate automated summaries of company activities, discussions, and project status updates.",
      images: ["/static/landing/knowledge/projectstatus.png"],
    },
    {
      title: "Industry radar",
      content:
        "Track and structure relevant news and market information into actionable insights and custom reports.",
      images: ["/static/landing/knowledge/aidigest.png"],
    },
  ],
};

export const Quote: QuoteProps = {
  quote:
    "It became evident that Dust could serve as a knowledgeable buddy for all staff, enhancing productivity whether you're newly onboarded or a veteran team member.",
  name: "Boris Lipiainen ",
  title: "Chief Product and Technology Officer at Kyriba",
  logo: "/static/landing/logos/color/kyriba.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl:
    "https://fast.wistia.net/embed/iframe/qtnvwgyt0o?web_component=true&seo=true&videoFoam=true&captions=on",
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
