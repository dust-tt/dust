import { LightbulbIcon, RocketIcon, UserGroupIcon } from "@dust-tt/sparkle";

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
  uptitle: "Customer Support",
  title: <>Instant knowledge, exceptional support</>,
  accentColor: "text-brand-electric-blue",
  description: (
    <>
      Equip your team with AI agents to accelerate issue resolution and increase
      customer satisfaction.
    </>
  ),
  bulletPoints: [
    "Deflect tickets by integrating AI agents directly in your product.",
    "Speed up ticket resolution from your staff.",
    "Identify and anticipate customer needs.",
    "Convert tickets into searchable knowledge base.",
  ],
  image: "/static/landing/support/ticketResolution.png",
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
        "Deflect Tier 1 tickets, surface relevant information from your knowledge bases and draft messages in 50+ languages.",
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
  color: "golden",
};

export const UseCases: UseCaseProps = {
  sectionTitle: "Your use cases, your way",
  sectionDescription:
    "Create custom AI agents without writing a single line of code.",
  items: [
    {
      title: "Ticket routing",
      content:
        "Automatically classify and route support tickets based on query history and team domain expertise.",
      images: ["/static/landing/support/ticketDeflection.png"],
    },
    {
      title: "Ticket resolution",
      content:
        "Speed up resolution by suggesting tailored responses drawn from your knowledge base and past solutions.",
      images: ["/static/landing/support/ticketResolution.png"],
    },
    {
      title: "Knowledge base augmentation",
      content:
        "Convert resolved tickets into searchable articles and FAQs, capturing best practices for future use.",
      images: ["/static/landing/support/docExpert.png"],
    },
    {
      title: "Ticket insights",
      content:
        "Turn support interactions into learning opportunities that enhance your offering and service standards.",
      images: ["/static/landing/support/ticketInsights.png"],
    },
  ],
};

const ROI: ROIProps = {
  number: "50%",
  subtitle: "reduction in ticket resolution time",
  logo: "/static/landing/logos/gray/malt.png",
};

export const Quote: QuoteProps = {
  quote:
    "We're managing a higher volume of tickets and have cut processing time—from an average of 6 minutes per ticket to just a few seconds.",
  name: "Anaïs Ghelfi",
  title: "Head of Data Platform at Malt",
  logo: "/static/landing/logos/color/malt.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl: "https://fast.wistia.net/embed/iframe/r0dwaexoez",
  showCaptions: true,
};

export const Stories: CustomerStory[] = [
  {
    title: "Blueground accelerates customer support resolution time with Dust",
    content:
      "Discover how Blueground boosted satisfaction and cut resolution time using Dust agents.",
    href: "https://blog.dust.tt/customer-support-blueground/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/06/Blueground_dust.jpg",
  },
  {
    title: "Malt cuts support ticket closing time by 50% with Dust",
    content:
      "Malt streamlines customer support using Dust's AI platform for rapid, consistent multilingual responses.",
    href: "https://blog.dust.tt/malt-customer-support/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/07/malt_dust.png",
  },
  {
    title: "Pennylane's journey to deploy Dust for Customer Care teams",
    content:
      "Dust evolved from a simple support tool into an integral part of Pennylane's operations.",
    href: "https://blog.dust.tt/pennylane-customer-support-journey/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Pennylane-__-Dust.jpg",
  },
  {
    title: "Lifen uses Dust AI agents to boost team productivity",
    content:
      "Lifen uses Dust AI agents to boost team productivity and save hours of work each week.",
    href: "https://blog.dust.tt/customer-story-lifen/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Lifen-__-Dust.png",
  },
];
