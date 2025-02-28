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
  bulletPoints: [
    "Generate instant meeting summaries",
    "Summarize complex documents quickly",
    "Polish communications professionally",
    "Get expert coaching on any topic",
  ],
  image: "/static/landing/productivity/contentoptimizer.png",
};

export const Hero: HeroProps = {
  uptitle: pageSettings.uptitle,
  title: pageSettings.title,
  description: pageSettings.description,
  visuals: [
    {
      src: "/static/landing/productivity/productivity1.png",
      alt: "Productivity Visual 1",
      depth: -30,
    },
    {
      src: "/static/landing/productivity/productivity2.png",
      alt: "Productivity Visual 2",
      depth: -10,
    },
    {
      src: "/static/landing/productivity/productivity3.png",
      alt: "Productivity Visual 3",
      depth: 20,
    },
    {
      src: "/static/landing/productivity/productivity4.png",
      alt: "Productivity Visual 4",
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
      value: "43%",
      description: <>of Kyriba employees save more than 3 hours weekly</>,
    },
    {
      value: "90%",
      description: <>weekly active users at Alan</>,
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
      title: "Meeting summaries",
      content:
        "Instantly change transcripts into personalized, richly contextualized summaries with clear next steps.",
      images: ["/static/landing/productivity/leadershipmeetingrecap.png"],
    },
    {
      title: "Content summarization",
      content:
        "Transform lengthy documents into clear summaries and key takeaways for quick comprehension.",
      images: ["/static/landing/productivity/blogdigest.png"],
    },
    {
      title: "Writing coach",
      content:
        "Enhance your communications with professional polish, improved clarity, and perfect grammar.",
      images: ["/static/landing/productivity/contentoptimizer.png"],
    },
    {
      title: "Domain Expert",
      content:
        "Access expert guidance and deep insights across any skill or knowledge domain.",
      images: ["/static/landing/productivity/discoverycoach.png"],
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
    "https://fast.wistia.net/embed/iframe/rnyvpdxfrk?web_component=true&seo=true&videoFoam=true&captions=on",
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
