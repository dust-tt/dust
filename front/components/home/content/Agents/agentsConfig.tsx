import {
  ClipboardCheckIcon,
  DocumentTextIcon,
  MagicIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

type SparkleIcon = ComponentType<{
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}>;

export interface AgentConfig {
  id: string;
  title: string;
  description: string;
  icon: SparkleIcon;
  colorClasses: {
    bg: string;
    icon: string;
    cardHover: string;
    tag: string;
  };
  tags: string[];
  href: string;
  seo: {
    title: string;
    description: string;
  };
}

export const AGENTS: AgentConfig[] = [
  {
    id: "sop-generator",
    title: "Free SOP Generator",
    description:
      "Turn any process into a clear, structured Standard Operating Procedure. Describe your workflow, get a production-ready document.",
    icon: DocumentTextIcon,
    colorClasses: {
      bg: "bg-golden-100",
      icon: "text-golden-700",
      cardHover: "hover:bg-golden-50",
      tag: "bg-golden-100 text-golden-700",
    },
    tags: ["Operations", "Documentation"],
    href: "/home/agents/sop-generator",
    seo: {
      title: "Free SOP Generator AI Agent | Dust",
      description:
        "Turn any process into a clear, structured Standard Operating Procedure with AI. Free and ready to use on Dust.",
    },
  },
  {
    id: "job-description",
    title: "Job Description Generator",
    description:
      "Write compelling, inclusive job descriptions in seconds. Tailored to your role, team, and company culture.",
    icon: UserGroupIcon,
    colorClasses: {
      bg: "bg-blue-100",
      icon: "text-blue-700",
      cardHover: "hover:bg-blue-50",
      tag: "bg-blue-100 text-blue-700",
    },
    tags: ["Recruiting", "HR"],
    href: "/home/agents/job-description",
    seo: {
      title: "Job Description Generator AI Agent | Dust",
      description:
        "Write compelling, inclusive job descriptions in seconds. Tailored to your role, team, and company culture using AI.",
    },
  },
  {
    id: "incident-postmortem",
    title: "Incident Postmortem Template",
    description:
      "Document incidents thoroughly with structured postmortems. Help your team learn faster and prevent recurrence.",
    icon: ClipboardCheckIcon,
    colorClasses: {
      bg: "bg-rose-100",
      icon: "text-rose-700",
      cardHover: "hover:bg-rose-50",
      tag: "bg-rose-100 text-rose-700",
    },
    tags: ["Engineering", "Operations"],
    href: "/home/agents/incident-postmortem",
    seo: {
      title: "Incident Postmortem AI Agent | Dust",
      description:
        "Document incidents thoroughly with AI-powered structured postmortems. Help your team learn faster and prevent recurrence.",
    },
  },
  {
    id: "prompt-maker",
    title: "Prompt Maker",
    description:
      "Transform vague ideas into precise, effective AI prompts. Get better results from any AI tool, every time.",
    icon: MagicIcon,
    colorClasses: {
      bg: "bg-green-100",
      icon: "text-green-700",
      cardHover: "hover:bg-green-50",
      tag: "bg-green-100 text-green-700",
    },
    tags: ["AI", "Productivity"],
    href: "/home/agents/prompt-maker",
    seo: {
      title: "Prompt Maker AI Agent | Dust",
      description:
        "Transform vague ideas into precise, effective AI prompts. Get better results from any AI tool, every time.",
    },
  },
];

export const AGENTS_PAGE_CONFIG = {
  hero: {
    uptitle: "AI Agents",
    title: <>Ready-to-use AI agents for your team</>,
    description: (
      <>
        Pre-built AI agents that save your team hours every week. Pick one,
        customize it to your workflow, and start working smarter in minutes.
      </>
    ),
  },
  gallery: {
    sectionTitle: "Meet your new AI teammates",
    sectionDescription:
      "Each agent is ready to use out of the box. No setup required.",
  },
  benefits: [
    {
      title: "Zero setup",
      description:
        "Every agent is pre-configured and ready to use the moment you open it.",
    },
    {
      title: "Fully customizable",
      description:
        "Adapt any agent's instructions, tone, and behavior to match your exact workflow.",
    },
    {
      title: "Enterprise-ready",
      description:
        "Built on Dust's secure, SOC 2 Type II certified infrastructure. Your data stays your data.",
    },
  ],
  seo: {
    title: "Ready-to-use AI Agents for Teams | Dust",
    description:
      "Browse Dust's library of pre-built AI agents. Generate SOPs, job descriptions, incident postmortems, and more. No setup required.",
  },
};
