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
  uptitle: "Recruiting & People",
  title: <>Streamline Operations, Focus on People</>,
  accentColor: "text-brand-red-rose",
  description: (
    <>Expedite HR operations and focus on what matters most - people.</>
  ),
  bulletPoints: [
    "Answer recurring HR questions with information from your policies.",
    "Onboard new hires through company processes and documentation.",
    "Guide managers to deliver quality feedback based on your company guidelines.",
  ],
  image: "/static/landing/hr/askhr.png",
  seo: {
    title: "AI HR & Recruiting Agents: Streamline Operations, Focus on People",
    description:
      "Expedite HR operations and focus on what matters most - people. Answer HR questions, onboard new hires, guide managers to deliver quality feedback.",
  },
};

export const Hero: HeroProps = {
  uptitle: pageSettings.uptitle,
  title: pageSettings.title,
  description: pageSettings.description,
  visuals: [
    {
      src: "/static/landing/hr/hr1.png",
      alt: "HR Visual 1",
      depth: -30,
    },
    {
      src: "/static/landing/hr/hr2.png",
      alt: "HR Visual 2",
      depth: -10,
    },
    {
      src: "/static/landing/hr/hr3.png",
      alt: "HR Visual 3",
      depth: 20,
    },
    {
      src: "/static/landing/hr/hr4.png",
      alt: "HR Visual 4",
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
  sectionTitle: "Transform HR operations into strategic impact",
  items: [
    {
      icon: MagicIcon,
      title: "Scale HR knowledge",
      description:
        "Turn policies into instant answers, enabling employee self-service.",
    },
    {
      icon: CheckCircleIcon,
      title: "Save HR time",
      description:
        "Automate routine tasks to invest more time in people development.",
    },
    {
      icon: UserGroupIcon,
      title: "Support managers",
      description:
        "Deploy consistent coaching and feedback across all management levels.",
    },
  ],
};

export const Metrics: MetricProps = {
  metrics: [
    {
      value: "100%",
      description: <>daily active users in HR at Alan</>,
    },
    {
      value: "30%",
      description: <>time savings on employee questions</>,
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
      title: "HR helpdesk",
      content:
        "Answer employee questions instantly using your HR policies and documented processes.",
      images: ["/static/landing/hr/askhr.png"],
    },
    {
      title: "Recruiting assistant",
      content:
        "Streamline candidate screening, communications, and interview preparation with automated support.",
      images: ["/static/landing/hr/interviewnotes.png"],
    },
    {
      title: "Manager coach",
      content:
        "Guide managers through feedback and reviews using company guidelines and best practices.",
      images: ["/static/landing/hr/reviewhelper.png"],
    },
    {
      title: "Onboarding guide",
      content:
        "Provide new employees with personalized guidance through company processes and culture.",
      images: ["/static/landing/hr/onboardingbuddy.png"],
    },
  ],
};

export const Quote: QuoteProps = {
  quote:
    "We asked ourselves for years: what if your team had 20% more time? Dust has made it possible, empowering our employees to work smarter, innovate, and push boundaries.",
  name: "Matthieu Birach",
  title: "Chief People Officer at Doctolib",
  logo: "/static/landing/logos/color/doctolib.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl: "https://fast.wistia.net/embed/iframe/eu73efeak9",
  showCaptions: true,
};

export const Stories: CustomerStory[] = [
  {
    title: "Creating an AI-first culture at Doctolib: the People team's role",
    content:
      "Doctolib's People team laid the foundations for AI transformation, driving 70% weekly usage across 3,000 employees through cultural change.",
    href: "/blog/why-doctolib-made-company-wide-enterprise-ai-a-national-cause",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Doctolib-__-Dust---Part-1.jpg",
  },
  {
    title: "30% time savings in HR: How Alan's People team scaled with Dust",
    content:
      "Alan's HR team quadrupled AI adoption and saved 30% of time spent on employee queries by deploying custom Dust agents for people operations.",
    href: "/blog/how-lucas-people-analyst-at-alan-introduced-dust-to-his-hr-team",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Alan-__-Dust-1--1-.png",
  },
  {
    title: "Clay accelerates team onboarding with Dust AI agents",
    content:
      "Clay uses Dust AI agents to onboard new GTM engineers faster and reduce bottlenecks, achieving 100% adoption and saving 58 hours monthly across their growing team",
    href: "/blog/clay-scaling-gtme-team",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/06/clay_dust_agents.jpg",
  },
];
