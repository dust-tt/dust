import type { IndustryPageConfig } from "@app/components/home/content/Industry/configs/utils";
import { createLayoutConfig } from "@app/components/home/content/Industry/configs/utils";
import { BarChartIcon } from "@dust-tt/sparkle";

export const consultingConfig: IndustryPageConfig = {
  seo: {
    title: "Dust for Consulting Firms",
    description:
      "Empower your consultants to deliver more value—faster. Build AI agents that instantly access firm knowledge, using best-in-class models of your choice.",
  },
  layout: createLayoutConfig([
    "hero",
    "impactMetrics",
    "dustInAction",
    "testimonial",
    "customerStories",
    "justUseDust",
  ]),
  hero: {
    chip: {
      label: "Consulting Firms",
      color: "blue",
      icon: BarChartIcon,
    },
    title: (
      <>
        Dust for
        <br /> Consulting
        <br /> Firms
      </>
    ),
    description:
      "Empower your consultants to deliver more value—faster. Build AI agents that instantly access firm knowledge, using best-in-class models of your choice.",
    ctaButtons: {
      primary: {
        label: "Get started",
        href: "/home/pricing",
      },
      secondary: {
        label: "Talk to sales",
        href: "/home/contact",
      },
    },
    testimonialCard: {
      quote:
        "In less than a year, we went from manual processes to 42 AI agents handling everything from strategy analysis to final delivery.",
      author: {
        name: "Vincent Vitré",
        title: "COO & Partner at Insign",
      },
      company: {
        logo: "/static/landing/logos/white/insign.svg",
        alt: "Insign logo",
      },
      bgColor: "bg-green-400",
      textColor: "text-white",
    },
    decorativeShapes: {
      topRight: "/static/landing/industry/shapes/rounded-rectangle.svg",
      bottomLeft: "/static/landing/industry/shapes/diamond.svg",
    },
  },
  impactMetrics: {
    bgColor: "bg-blue-50",
    metrics: [
      {
        value: "90",
        unit: "%+",
        type: "Adoption",
        description: "firm-wide",
      },
      {
        value: "50",
        unit: "%",
        type: "Time Saved",
        description: "on commercial proposals",
      },
      {
        value: "20",
        unit: "min",
        type: "Deep Research",
        description: "across sectors, clients & projects vs. 4 days of traditional research",
      },
    ],
  },
  dustInAction: {
    title: "Top Use Cases for Consulting Firms",
    useCases: [
      {
        title: "Commercial Support",
        image: "/static/landing/industry/features/Sales_agent.webp",
        bgColor: "bg-rose-100",
        features: [
          {
            icon: "bg-red-500 rounded-br-full",
            title: "RFP & Proposal Response",
            description:
              "Craft tailored RFP/proposal responses using internal best practices.",
          },
          {
            icon: "bg-purple-500 rounded-tl-full",
            title: "Workforce Planning & CV Matching",
            description:
              "Identify best people for RFPs based on skills and former project experience.",
          },
          {
            icon: "bg-blue-500 rounded-tr-full",
            title: "CXO Meeting Preparation & Follow-ups",
            description:
              "Compile CXO-ready briefing packs with client + industry insights.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Prospect Outreach & Communication",
            description:
              "Generate targeted outreach emails, meeting follow-ups, and social posts for prospects.",
          },
        ],
      },
      {
        title: "Consulting Delivery Operations",
        image: "/static/landing/industry/features/Search_assistant.webp",
        bgColor: "bg-blue-100",
        features: [
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Report & Slide Generation",
            description:
              "Auto-draft executive summaries, strategic reports, and client presentations.",
          },
          {
            icon: "bg-pink-400 rounded-tr-full",
            title: "Data Analysis Assistant",
            description:
              "Analyze client-level data, build SQL queries, Excel formulas, and generate data-driven recommendations.",
          },
          {
            icon: "bg-green-500 rounded-bl-full",
            title: "Documentation & CRM Management",
            description:
              "Auto-populate CRM, sanitize client files for archiving, and structure project documentation.",
          },
          {
            icon: "bg-yellow-400 rounded-br-full",
            title: "Cognitive Twin",
            description:
              "Capture and replicate expert knowledge to scale consulting expertise across the firm.",
          },
        ],
      },
      {
        title: "Internal Operations & Compliance",
        image: "/static/landing/industry/features/Doc_analysis_2.webp",
        bgColor: "bg-green-100",
        features: [
          {
            icon: "bg-gray-600 rounded-tl-full",
            title: "Mission Status Reporting",
            description:
              "Automate project status reports and track mission progress across engagements.",
          },
          {
            icon: "bg-blue-500 rounded-tr-full",
            title: "Internal Policy & Compliance Support",
            description:
              "Answer policy, HR, governance & compliance questions on demand.",
          },
          {
            icon: "bg-yellow-400 rounded-bl-full",
            title: "Project Insights & Post-Mortem Analyzer",
            description:
              "Extract project lessons learned; drive post-mortem analyses.",
          },
          {
            icon: "bg-green-500 rounded-br-full",
            title: "Financial Support",
            description:
              "Automate financial reports, client payment reminders & compliance tasks.",
          },
        ],
      },
      {
        title: "Marketing & Intelligence",
        image: "/static/landing/industry/features/Social_post.webp",
        bgColor: "bg-orange-100",
        features: [
          {
            icon: "bg-blue-500 rounded-tl-full",
            title: "Strategic Project Insights",
            description:
              "Generate strategic insights and analysis from internal project data.",
          },
          {
            icon: "bg-sky-400",
            title: "Industry Intelligence",
            description:
              "Develop industry radars and competitive landscape reports.",
          },
          {
            icon: "bg-red-500 rounded-br-full",
            title: "Competitive Intelligence",
            description:
              "Monitor competitor activities, market positioning, and win/loss analysis.",
          },
          {
            icon: "bg-green-500 rounded-tr-full",
            title: "Content Creation & Optimization",
            description:
              "Write LinkedIn/blog posts aligned with brand guidelines.",
          },
        ],
      },
    ],
  },
  testimonial: {
    quote:
      "In less than a year, we went from manual processes to 42 AI agents handling everything from strategy analysis to final delivery.",
    author: {
      name: "Vincent Vitré",
      title: "COO & Partner at Insign",
    },
    company: {
      logo: "/static/landing/logos/white/insign.svg",
      alt: "Insign logo",
    },
    bgColor: "bg-green-400",
    textColor: "text-white",
  },
  justUseDust: {
    title: "#JustUseDust",
    titleColor: "text-blue-600",
    ctaButtons: {
      primary: {
        label: "Get started",
        href: "/home/pricing",
      },
      secondary: {
        label: "Talk to sales",
        href: "/home/contact",
      },
    },
    bgColor: "bg-blue-50",
    decorativeShapes: true,
  },
};
