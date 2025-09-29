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
  uptitle: "Marketing",
  title: <>Create On-Brand Content At Scale</>,
  accentColor: "text-brand-orange-golden",
  description: (
    <>
      Scale content production, maintain brand consistency,
      and&nbsp;optimize&nbsp;reach across channels.
    </>
  ),
  bulletPoints: [
    "Localize content in multiple languages with brand consistency.",
    "Draft high-quality customer stories following company templates.",
    "Create compelling social media copy.",
    "Monitor industry and competitor news.",
  ],
  image: "/static/landing/marketing/crossMedia.png",
};

export const Hero: HeroProps = {
  uptitle: pageSettings.uptitle,
  title: pageSettings.title,
  description: pageSettings.description,
  visuals: [
    {
      src: "/static/landing/marketing/marketing1.png",
      alt: "Marketing Visual 1",
      depth: -30,
    },
    {
      src: "/static/landing/marketing/marketing2.png",
      alt: "Marketing Visual 2",
      depth: -10,
    },
    {
      src: "/static/landing/marketing/marketing3.png",
      alt: "Marketing Visual 3",
      depth: 20,
    },
    {
      src: "/static/landing/marketing/marketing4.png",
      alt: "Marketing Visual 4",
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
  sectionTitle: "Elevate your content strategy to new heights",
  items: [
    {
      icon: MagicIcon,
      title: "Focus on strategy",
      description:
        "Maximize impact by automating content creation and optimization tasks.",
    },
    {
      icon: CheckCircleIcon,
      title: "Ensure consistency",
      description:
        "Maintain perfect brand alignment across all content and communication channels.",
    },
    {
      icon: UserGroupIcon,
      title: "Scale production",
      description:
        "Transform your content workflow into an efficient, brand-compliant machine.",
    },
  ],
};

export const Metrics: MetricProps = {
  metrics: [
    {
      value: "70%",
      description: <>time reduction in localization</>,
    },
    {
      value: "5X",
      description: <> brand-compliant copy generation</>,
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
      title: "Content localization",
      content:
        "Translate and adapt content across languages while maintaining brand voice and cultural relevance.",
      images: ["/static/landing/marketing/localizer.png"],
    },
    {
      title: "Content optimization",
      content:
        "Transform raw content into polished, SEO-optimized pieces that align with brand guidelines.",
      images: ["/static/landing/marketing/contentOptimizer.png"],
    },
    {
      title: "Social media cross-posting",
      content:
        "Create engaging UX and social media content that consistently reflects your brand identity.",
      images: ["/static/landing/marketing/crossMedia.png"],
    },
    {
      title: "Market intelligence",
      content:
        "Monitor market movements and competitor activities to inform your content strategy and battle cards.",
      images: ["/static/landing/marketing/aiNewsletter.png"],
    },
  ],
};

const ROI: ROIProps = {
  number: "70%",
  subtitle: "time reduction in localization",
  logo: "/static/landing/logos/gray/qonto.png",
};

export const Quote: QuoteProps = {
  quote:
    "Dust is not just a tool - it's like having an extra team member who knows your brand voice, can handle recurring tasks, and helps you tackle new challenges. I couldn't do half of my job without it, especially with tight deadlines and a small team.",
  name: "Valentine Chelius",
  title: "Head of Marketing at Fleet",
  logo: "/static/landing/logos/color/fleet.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl: "https://fast.wistia.net/embed/iframe/z8ky9a7ugn",
  showCaptions: true,
};

export const Stories: CustomerStory[] = [
  {
    title: "How Alan produces customer stories 80% faster with Dust",
    content:
      "Alan's marketing team uses Dust to create customer stories that resonate with their audience, all while maintaining brand consistency.",
    href: "https://blog.dust.tt/alan-marketing-customer-story-production-dust/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Alan-__-Dust-1.png",
  },
  {
    title: "How Qonto Achieved 70% Faster Localization with Dust",
    content:
      "Qonto's Tolki assistant serves as a virtual polyglot, helping the content team localize content while maintaining brand voice and regional standards.",
    href: "https://blog.dust.tt/qonto-dust-ai-partnership/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Qonto-__-Dust.jpg",
  },
  {
    title: "Building a Marketing Engine from Scratch at Fleet",
    content:
      "With just two interns, Valentine created a scalable marketing operation using Dust's AI capabilities for content and brand management.",
    href: "https://blog.dust.tt/how-valentine-head-of-marketing-at-fleet-uses-dust/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_fleet.png",
  },
  // {
  //   title: "Lifen uses Dust AI agents to boost team productivity", // Soon to be replaced with Clay for RFP?
  //   content:
  //     "Lifen uses Dust AI agents to boost team productivity and save hours of work each week.",
  //   href: "https://blog.dust.tt/customer-story-lifen/",
  //   src: "https://blog.dust.tt/content/images/size/w2000/2024/11/lifen_dust_customer_story.jpg",
  // },
];
