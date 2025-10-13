import {
  CheckCircleIcon,
  MagicIcon,
  RocketIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import Link from "next/link";

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

// FAQ items for the sales page
export const salesFAQItems = [
  {
    question: "How do AI sales agents understand my business?",
    answer: (
      <>
        Most sales automation tools treat every company the same way, applying
        generic rules that ignore what makes{" "}
        <strong>YOUR business unique</strong>.
        <br />
        Salesforce Einstein, HubSpot AI, and traditional CRM automation apply
        the same one-size-fits-all logic to your unique market and customers,
        delivering generic results for everyone.
        <br />
        <strong>Dust's AI sales agents work differently.</strong> They're
        custom-built to understand your specific business. They connect to your
        CRM, sales tools like <strong>Gong</strong> and{" "}
        <strong>Intercom</strong>, your knowledge base, and team expertise to
        adapt how you approach your sales process.
        <br />
        AI sales agents access your company playbooks to understand how you
        operate, handle the mundane tasks, and let your sales team do what
        humans do best: <strong>build relationships and close deals</strong>.
      </>
    ),
  },
  {
    question: "How do AI sales agents actually work?",
    answer: (
      <>
        Most AI tools follow basic rules. AI sales agents access your business
        context and can retain information within conversations. They work
        within your existing sales process rather than forcing you to change how
        you sell.
        <br />
        <h3>They connect all your tools</h3>
        While Salesforce AI only knows Salesforce data and HubSpot's AI stays
        within HubSpot's walls, Dust AI sales agents break down these silos
        entirely. They connect across your entire sales ecosystem:
        <ul>
          <li>CRM records</li>
          <li>Support tickets</li>
          <li>Product documentation</li>
          <li>Competitive intelligence</li>
          <li>Past presentations</li>
          <li>Call transcripts</li>
          <li>Team knowledge</li>
        </ul>
        <strong>Result:</strong> Insights that no single platform could deliver.
        <br />
        <h3>They do the right things, not just things</h3>
        AI sales agents understand <strong>why</strong> tasks matter. When
        preparing for a call, they don't just pull random data. They:
        <ul>
          <li>Analyze the prospect's industry</li>
          <li>Find similar deals you've won</li>
          <li>Grab relevant competitive info</li>
          <li>Build talking points that match how you sell</li>
        </ul>
        <h3>They work where you work</h3>
        AI sales agents integrate with your whole stack:
        <strong>
          {" "}
          Salesforce, HubSpot, Gong, Intercom, Zendesk, Slack, Notion, Google
          Drive, Google Meet
        </strong>
        , etc. They bring insights to your existing workflow, not the other way
        around.
        <br />
        <h3>They start smart, then get smarter</h3>
        Begin with templates like <strong>accountSnapshot</strong> for meeting
        prep or <strong>prospectQuestions</strong> for RFPs. Connect your data,
        adjust the template using plain language prompts to match your process,
        and refine them based on feedback and results.
      </>
    ),
  },
  {
    question: "How do AI sales agents increase your sales performance?",
    answer: (
      <>
        <h3>Lead qualification</h3>
        Using Dust's <strong>@ProspectIQ</strong> template alongside
        <strong> @SignupRadar</strong> and <strong>@CompanySearch</strong>, AI
        sales agents research company backgrounds, analyze funding status,
        assess technology stacks, and score prospects against your ideal
        customer profile.
        <h3>Meeting preparation</h3>
        The <strong>@salesAccountSummary</strong> template pulls data from your
        CRM, support tickets, product usage analytics, and market intelligence
        to create <strong>comprehensive account briefings in minutes</strong>.
        Sales teams at PayFit and Alan use this capability to prepare for
        meetings and account handovers faster than manual research could ever
        achieve.{" "}
        <a
          href="https://blog.dust.tt/generative-ai-insights-alan-payfit-leaders/"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4"
        >
          See how these teams gained 20% productivity
        </a>
        .<h3>RFP handling</h3>
        Dust's <strong>@securitySam</strong> template for RFPs and
        <strong> @salesCopilot</strong> for prospect requests access your
        product specifications, compliance documentation, and previous
        successful responses to generate accurate, consistent answers. Kyriba's
        team saves
        <strong> over 3 hours weekly per person</strong> using this capability.
        <h3>Call analysis</h3>
        The <strong>@transcriptInsights</strong> agent for managers and
        <strong> @salescoach</strong> for individual reps analyze call
        recordings to identify successful objection handling, spot coaching
        opportunities, and surface winning narratives.
        <h3>Follow-ups</h3>
        Using <strong>@FollowUpAgent</strong> and
        <strong> @salesOutboundDraft</strong> templates, AI sales agents
        generate <strong>personalized follow-up emails</strong> from call
        transcripts, CRM data, and relevant product information.
      </>
    ),
  },
  {
    question: "Why do generic tools fall short?",
    answer: (
      <>
        Most sales automation is built for an average company that doesn't
        exist. Generic tools offer basic features but miss what makes your sales
        process work.
        <br />
        <h3>Data stays trapped</h3>
        Sales tools should connect information. Instead, they create more walls.
        <ul>
          <li>
            <strong>Salesforce's AI</strong> only sees Salesforce data
          </li>
          <li>
            <strong>HubSpot AI</strong> stays in HubSpot
          </li>
          <li>Your team ends up copying information between tools</li>
          <li>Wasting time they could spend selling</li>
        </ul>
        <h3>No room to be different</h3>
        You can change templates in generic tools, but you can't change how they
        think. They don't learn your market position, your success stories, or
        why customers choose you.
        <h3>Dust's template advantage</h3>
        Start with proven frameworks like <strong>coldEmailer</strong> or
        <strong> salesMeetingRecap</strong>, then make them yours. These
        templates adapt to your terminology and sales approach, and can be
        shared across teams—with each team adding their specific needs.
      </>
    ),
  },
  {
    question: "How do you build an AI sales agent?",
    answer: (
      <>
        Building AI sales agents is straightforward and takes only a few
        minutes.
        <br />
        <h3>Step 1: Pick a template</h3>
        Choose what you need first:
        <ul>
          <li>
            <strong>@ProspectIQ</strong> for lead research
          </li>
          <li>
            <strong>@securitySam</strong> for RFPs
          </li>
          <li>
            <strong>@salesAccountSummary</strong> for meeting prep
          </li>
        </ul>
        <h3>Step 2: Connect your tools</h3>
        One-click connections to
        <strong> Salesforce, HubSpot, Slack, Notion</strong>, and more. Your
        agent immediately accesses your CRM, support tickets, and documentation.
        <h3>Step 3: Make it yours</h3>
        Describe your sales process in plain English using Dust's visual
        interface.
        <h3>Step 4: Use it anywhere</h3>
        Your agent works where you do: in your browser with the{" "}
        <Link
          href="/home/chrome-extension"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4"
        >
          Chrome extension
        </Link>
        , Slack conversations, or connected to your other tools.
        <h3>Step 5: Improve over time</h3>
        Watch what works, collect feedback, and refine. Add more capabilities as
        your needs grow.
        <br />
        <strong>Getting started:</strong> Most teams start with one template
        during a free trial. As they see results, they expand to cover more of
        their sales process.
        <br />
        <br />
        <strong>Want to try it out?</strong>
        <br /> Take a look at how other teams use these agents, try Dust for
        free today or{" "}
        <Link href="/home/pricing" className="underline underline-offset-4">
          talk to our sales team
        </Link>{" "}
        to see how AI sales agents can improve your process.
      </>
    ),
  },
];
