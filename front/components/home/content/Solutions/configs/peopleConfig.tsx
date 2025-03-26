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
  accentColor: "text-brand-electric-blue",
  description: (
    <>Expedite HR operations and focus on what matters most - people.</>
  ),
  bulletPoints: [
    "Answer recurring HR questions with information from your policies",
    "Onboard new hires through company processes and documentation",
    "Guide managers to deliver quality feedback based on your company guidelines",
  ],
  image: "/static/landing/hr/askhr.png",
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
  from: "from-golden-200",
  to: "to-golden-200",
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
  name: "Matthieu Birach ",
  title: "Chief People Officer at Doctolib",
  logo: "/static/landing/logos/doctolib.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl:
    "https://fast.wistia.net/embed/iframe/eu73efeak9?seo=true&videoFoam=true&captions=on",
};

export const Stories: CustomerStory[] = [
  {
    title: "30% time savings in HR: How Alan's People team scaled with Dust",
    content:
      "Alan's HR team quadrupled AI adoption and saved 30% of time spent on employee queries by deploying custom Dust agents for people operations.",
    href: "https://blog.dust.tt/how-lucas-people-analyst-at-alan-introduced-dust-to-his-hr-team/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/01/dust_alan.png",
  },
  // {
  //   title: "Kyriba's RFP Agent for improving pre-sales efficiency",
  //   content:
  //     "42% of Kyriba employees save 1 to 3 hours weekly leveraging Dust for RFPs.",
  //   href: "https://blog.dust.tt/kyriba-accelerating-innovation-with-dust/",
  //   src: "https://blog.dust.tt/content/images/size/w2000/2024/10/kyriba_dust.jpg",
  // },
  // {
  //   title: "Lifen uses Dust AI agents to boost team productivity", // Soon to be replaced with Clay for RFP?
  //   content:
  //     "Lifen uses Dust AI agents to boost team productivity and save hours of work each week.",
  //   href: "https://blog.dust.tt/customer-story-lifen/",
  //   src: "https://blog.dust.tt/content/images/size/w2000/2024/11/lifen_dust_customer_story.jpg",
  // },
];
