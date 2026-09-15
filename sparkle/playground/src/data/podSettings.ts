import {
  File02,
  Globe01,
  Image01,
  Table,
  Terminal,
  Type01,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

import type { Agent } from "./types";

// The agent new conversations fall back to when a Pod sets no default.
export const DUST_DEFAULT_AGENT: Agent = {
  id: "agent-dust",
  name: "dust",
  emoji: "✨",
  backgroundColor: "bg-primary-100",
  description: "The generalist agent, with access to every Pod tool.",
};

// Skills are surfaced both in the agent browser (alongside agents) and in Pod
// settings as the Pod's default skills. A skill is rendered with a
// highlight-tinted avatar (highlight-50 background, highlight-700 icon).
export type Skill = {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
};

export const mockSkills: Skill[] = [
  {
    id: "skill-web-search",
    name: "Web search",
    description: "Search the web for up-to-date information.",
    icon: Globe01,
  },
  {
    id: "skill-summarize",
    name: "Summarize",
    description: "Condense long documents into key takeaways.",
    icon: File02,
  },
  {
    id: "skill-image",
    name: "Image generation",
    description: "Create images from a text prompt.",
    icon: Image01,
  },
  {
    id: "skill-code",
    name: "Code interpreter",
    description: "Run code to analyze data and files.",
    icon: Terminal,
  },
  {
    id: "skill-tables",
    name: "Query tables",
    description: "Ask questions over structured tables.",
    icon: Table,
  },
  {
    id: "skill-translate",
    name: "Translate",
    description: "Translate text across languages.",
    icon: Type01,
  },
];

export const DEFAULT_POD_SKILL_IDS = ["skill-web-search", "skill-tables"];

// Groups attached to a Pod. `kind` mirrors the two group kinds users actually
// see: provisioned ones come from the IdP, manual ones are managed in Dust.
export type PodGroupKind = "provisioned" | "manual";

export type PodGroup = {
  id: string;
  name: string;
  kind: PodGroupKind;
  role: "member" | "editor";
  onClick?: () => void; // For DataTable compatibility
};

export const MOCK_POD_GROUPS: PodGroup[] = [
  {
    id: "group-growth",
    name: "Growth Team",
    kind: "provisioned",
    role: "editor",
  },
  {
    id: "group-design",
    name: "Design Guild",
    kind: "manual",
    role: "member",
  },
  {
    id: "group-data",
    name: "Data Platform",
    kind: "provisioned",
    role: "member",
  },
];

// Env vars mounted on the Pod's Computer. `config` values are plain env vars;
// `https_secret` values are only injected into requests to their allowed
// domains and can never be read back.
export type PodEnvVarKind = "config" | "https_secret";

export type PodEnvVar = {
  name: string;
  kind: PodEnvVarKind;
  allowedDomains?: string[];
  updatedAgo: string;
  updatedBy: string;
};

export const MOCK_POD_ENV_VARS: PodEnvVar[] = [
  {
    name: "DSEC_OPENAI_API_KEY",
    kind: "https_secret",
    allowedDomains: ["api.openai.com"],
    updatedAgo: "2 days",
    updatedBy: "Marie Dupont",
  },
  {
    name: "DSEC_STRIPE_SECRET",
    kind: "https_secret",
    allowedDomains: ["api.stripe.com", "*.stripe.com"],
    updatedAgo: "3 weeks",
    updatedBy: "Sacha Morel",
  },
  {
    name: "DUST_SANDBOX_REGION",
    kind: "config",
    updatedAgo: "5 hours",
    updatedBy: "Marie Dupont",
  },
];

export const MOCK_POD_EGRESS_DOMAINS = [
  "api.openai.com",
  "*.mistral.ai",
  "raw.githubusercontent.com",
];

export const MOCK_POD_EGRESS_REQUESTS = ["registry.npmjs.org"];

// Notification preferences, shared by the Pod "..." menu and the General
// settings tab so both surfaces offer the same choices.
export type PodNotificationCondition =
  | "never"
  | "only_mentions"
  | "all_messages";

export const POD_NOTIFICATION_OPTIONS: {
  value: PodNotificationCondition;
  label: string;
}[] = [
  { value: "never", label: "Don't notify me" },
  { value: "only_mentions", label: "Only when mentioned" },
  { value: "all_messages", label: "All activity" },
];

export const DEFAULT_POD_NOTIFICATION_CONDITION: PodNotificationCondition =
  "all_messages";

// Names the Pod name field reports as already taken.
export const TAKEN_POD_NAMES = [
  "Engineering",
  "Growth",
  "Marketing",
  "Support",
];

export const DEFAULT_POD_AGENTS_MD = `# Working in this Pod

- Answer in the language of the question.
- Always cite the Pod files you used.
- Ask before creating a task on someone else's behalf.
`;

export const POD_AGENTS_MD_FILENAME = "AGENTS.md";

export const POD_AGENTS_MD_MAX_CHARACTER_COUNT = 8192;

export const MAX_POD_FILE_TABS = 8;

export const MAX_POD_FILE_TAB_TITLE_LENGTH = 64;
