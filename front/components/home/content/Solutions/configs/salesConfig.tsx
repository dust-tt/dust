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
  accentColor: "text-brand-red-rose",
  description: (
    <>
      Optimize every touchpoint, automate administrative overhead, and close
      deals faster.
    </>
  ),
  bulletPoints: [
    "Generate instant account snapshots to prepare for meetings.",
    "Auto-complete RFPs and forms.",
    "Create personalized outreach and follow-ups.",
    "Coach sales reps with call insights.",
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
  color: "golden",
};

export const UseCases: UseCaseProps = {
  sectionTitle: "Your use cases, your way",
  sectionDescription:
    "Build custom agents without writing a single line of code.",
  items: [
    {
      title: "Account snapshot",
      content:
        "Craft account overviews with key past interactions, data, or news to prepare for meetings or account handovers.",
      images: ["/static/landing/sales/accountSnapshot.png"],
    },
    {
      title: "Engage and re-engage",
      content:
        "Create targeted cold emails and automated meeting follow-ups using call transcripts, CRM data and industry insights.",
      images: ["/static/landing/sales/meetingSummary.png"],
    },
    {
      title: "Prospect questions",
      content:
        "Answer prospect questions and RFPs instantly with fresh, expert insights on products, competitors, and security.",
      images: ["/static/landing/sales/prospectQuestions.png"],
    },
    {
      title: "Sales insights",
      content:
        "Extract winning narratives from calls and coach teams on pitch delivery and objection response.",
      images: ["/static/landing/sales/salesCoach.png"],
    },
  ],
};

export const Quote: QuoteProps = {
  quote:
    "Dust is the most impactful software we've adopted since building Clay. It continuously gets smarter, turning hours of documentation search into instant, cited answers—letting our team spend less time searching and more time closing deals.",
  name: "Everett Berry ",
  title: "Head of GTM Engineering at Clay",
  logo: "/static/landing/logos/color/clay.png",
};

export const DemoVideo: DemoVideoProps = {
  sectionTitle: "Watch Dust in motion",
  videoUrl: "https://fast.wistia.net/embed/iframe/8q80neektv",
  showCaptions: true,
};

export const Stories: CustomerStory[] = [
  {
    title: "Clay powers 4x sales team growth with Dust AI agents",
    content:
      "Clay uses Dust AI agents to scale their GTM team 4x while maintaining sales velocity.",
    href: "https://blog.dust.tt/clay-scaling-gtme-team/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/06/clay_dust_agents.jpg",
  },
  {
    title: "Alan's teams save 3h weekly scraping sales transcripts",
    content:
      "Alan’s sales & marketing team transforms sales conversations into intelligence with AI agents",
    href: "https://blog.dust.tt/alans-pmm-team-transforms-sales-conversations-into-intelligence-with-ai-agents/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Alan-__-Dust-1-1.png",
  },
  {
    title: "Kyriba's RFP Agent for improving pre-sales efficiency",
    content:
      "43% of Kyriba employees save more than 3 hours weekly leveraging Dust for RFPs.",
    href: "https://blog.dust.tt/kyriba-accelerating-innovation-with-dust/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/07/Kyriba-__-Dust.png",
  },
  {
    title: "20%+ productivity gains in Sales: Insights from Alan and Payfit",
    content:
      "Dust agents significantly lowered their acquisition costs, allowing them to hire more salespeople.",
    href: "https://blog.dust.tt/generative-ai-insights-alan-payfit-leaders/",
    src: "https://blog.dust.tt/content/images/size/w2000/2025/01/Founder.jpg",
  },
];
