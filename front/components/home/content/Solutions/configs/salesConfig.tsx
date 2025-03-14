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
  uptitle: "Sales",
  title: (
    <>
      Smart automations, <br></br>more deals
    </>
  ),
  from: "from-emerald-200",
  to: "to-emerald-500",
  description: (
    <>
      Optimize every touchpoint, automate administrative overhead, and close
      deals faster.
    </>
  ),
  bulletPoints: [
    "Generate instant account snapshots to prepare for meetings",
    "Auto-complete RFPs and forms",
    "Create personalized outreach and follow-ups",
    "Coach sales reps with call insights",
  ],
  image: "/static/landing/sales/accountSnapshot.png",
};

export const Hero: HeroProps = {
  uptitle: pageSettings.uptitle,
  title: pageSettings.title,
  description: pageSettings.description,
  visuals: [
    {
      src: "/static/landing/sales/sales1.png",
      alt: "Sales Visual 1",
      depth: -30,
    },
    {
      src: "/static/landing/sales/sales2.png",
      alt: "Sales Visual 2",
      depth: -10,
    },
    {
      src: "/static/landing/sales/sales3.png",
      alt: "Sales Visual 3",
      depth: 20,
    },
    {
      src: "/static/landing/sales/sales4.png",
      alt: "Sales Visual 4",
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
  sectionTitle: "Elevate your sales reps to new possibilities ",
  items: [
    {
      icon: MagicIcon,
      title: "Focus on selling",
      description:
        "Maximize selling time by automating admin tasks and data entry.",
    },
    {
      icon: CheckCircleIcon,
      title: "Raise the odds of closing",
      description:
        "Instantly uncover relevant product or prospect insights to deliver personalized responses",
    },

    {
      icon: UserGroupIcon,
      title: "Boost team performance",
      description:
        "Turn every rep into a top performer by sharing feedback and best practices.",
    },
  ],
};

export const Metrics: MetricProps = {
  metrics: [
    {
      value: "90%",
      description: <>faster RFP response times</>,
    },
    {
      value: "8h",
      description: <> saved weekly per rep for selling</>,
    },
  ],
  from: "from-amber-200",
  to: "to-amber-500",
};

export const UseCases: UseCaseProps = {
  sectionTitle: "Your use cases, your way",
  sectionDescription:
    "Build custom agents without writing a single line of code.",
  items: [
    {
      title: "Account snapshot",
      content:
        "Create account summaries with key historical interactions, data or news wherever they are hosted.",
      images: ["/static/landing/sales/accountSnapshot.png"],
    },
    {
      title: "Engage and re-engage",
      content:
        "Create targeted cold emails and re-engagement messages using call transcripts, CRM data and industry insights",
      images: ["/static/landing/sales/meetingSummary.png"],
    },
    {
      title: "Prospect questions",
      content:
        "Answer prospect questions and RFPs instantly with fresh, expert insights on products, competitors, and security.",
      images: ["/static/landing/sales/prospectQuestions.png"],
    },
    {
      title: "Sales coaching",
      content:
        "Parse call transcripts to coach salespeople on their pitch and understand where deals fail.",
      images: ["/static/landing/sales/salesCoach.png"],
    },
  ],
};

export const Quote: QuoteProps = {
  quote:
    "Dust is the most impactful software we've adopted since building Clay. It continuously gets smarter, turning hours of documentation search into instant, cited answers—letting our team spend less time searching and more time closing deals.",
  name: "Everett Berry ",
  title: "Head of GTM Engineering at Clay",
  logo: "/static/landing/logos/clay.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl:
    "https://fast.wistia.net/embed/iframe/8q80neektv?web_component=true&seo=true&videoFoam=true&captions=on",
};

export const Stories: CustomerStory[] = [
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
  {
    title: "Lifen uses Dust AI agents to boost team productivity", // Soon to be replaced with Clay for RFP?
    content:
      "Lifen uses Dust AI agents to boost team productivity and save hours of work each week.",
    href: "https://blog.dust.tt/customer-story-lifen/",
    src: "https://blog.dust.tt/content/images/size/w2000/2024/11/lifen_dust_customer_story.jpg",
  },
];
