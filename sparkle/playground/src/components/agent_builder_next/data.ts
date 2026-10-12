import {
  ClaudeLogo,
  Clock,
  ConfluenceLogo,
  DriveLogo,
  GeminiLogo,
  GithubLogo,
  GmailLogo,
  HubspotLogo,
  JiraLogo,
  LinearLogo,
  MicrosoftLogo,
  MistralLogo,
  NotionLogo,
  OpenaiLogo,
  SalesforceLogo,
  SlackLogo,
  SnowflakeLogo,
  ZendeskLogo,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

import { mockAgents } from "../../data/agents";
import { mockManagedSkills, mockTools } from "../../data/build";
import { mockUsers } from "../../data/users";

// Mock data for the production-parity agent builder. Everything here is fake:
// it mirrors the shapes the product renders so the screen can be exercised
// end to end without a backend.

export type IconComponent = ComponentType<{ className?: string }>;

// ---------------------------------------------------------------------------
// Models and reasoning
// ---------------------------------------------------------------------------

export const REASONING_EFFORTS = [
  "none",
  "min",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export type ModelMaker = "Anthropic" | "OpenAI" | "Google" | "Mistral";

export type MockModel = {
  id: string;
  displayName: string;
  maker: ModelMaker;
  logo: IconComponent;
  supportsStructuredOutput: boolean;
  /** Indexes into REASONING_EFFORTS that this model can run at. */
  availableEfforts: ReasoningEffort[];
  defaultEffort: ReasoningEffort;
  isDegraded?: boolean;
};

export const MODEL_MAKER_LOGOS: Record<ModelMaker, IconComponent> = {
  Anthropic: ClaudeLogo,
  OpenAI: OpenaiLogo,
  Google: GeminiLogo,
  Mistral: MistralLogo,
};

export const mockModels: MockModel[] = [
  {
    id: "claude-4-sonnet",
    displayName: "Claude 4 Sonnet",
    maker: "Anthropic",
    logo: ClaudeLogo,
    supportsStructuredOutput: true,
    availableEfforts: ["none", "low", "medium", "high"],
    defaultEffort: "medium",
  },
  {
    id: "claude-4-opus",
    displayName: "Claude 4 Opus",
    maker: "Anthropic",
    logo: ClaudeLogo,
    supportsStructuredOutput: true,
    availableEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultEffort: "high",
  },
  {
    id: "claude-3-5-haiku",
    displayName: "Claude 3.5 Haiku",
    maker: "Anthropic",
    logo: ClaudeLogo,
    supportsStructuredOutput: false,
    availableEfforts: ["none"],
    defaultEffort: "none",
  },
  {
    id: "gpt-5",
    displayName: "GPT-5",
    maker: "OpenAI",
    logo: OpenaiLogo,
    supportsStructuredOutput: true,
    availableEfforts: ["min", "low", "medium", "high", "xhigh"],
    defaultEffort: "medium",
  },
  {
    id: "gpt-5-mini",
    displayName: "GPT-5 mini",
    maker: "OpenAI",
    logo: OpenaiLogo,
    supportsStructuredOutput: true,
    availableEfforts: ["min", "low", "medium"],
    defaultEffort: "low",
  },
  {
    id: "o3",
    displayName: "o3",
    maker: "OpenAI",
    logo: OpenaiLogo,
    supportsStructuredOutput: true,
    availableEfforts: ["low", "medium", "high"],
    defaultEffort: "medium",
    isDegraded: true,
  },
  {
    id: "gemini-2-5-pro",
    displayName: "Gemini 2.5 Pro",
    maker: "Google",
    logo: GeminiLogo,
    supportsStructuredOutput: true,
    availableEfforts: ["none", "low", "medium", "high"],
    defaultEffort: "medium",
  },
  {
    id: "gemini-2-5-flash",
    displayName: "Gemini 2.5 Flash",
    maker: "Google",
    logo: GeminiLogo,
    supportsStructuredOutput: false,
    availableEfforts: ["none", "low"],
    defaultEffort: "none",
  },
  {
    id: "mistral-large",
    displayName: "Mistral Large",
    maker: "Mistral",
    logo: MistralLogo,
    supportsStructuredOutput: false,
    availableEfforts: ["none"],
    defaultEffort: "none",
  },
];

export type ModelTierId = "basic" | "standard" | "premium";

export type ModelTier = {
  id: ModelTierId;
  label: string;
  /** The concrete model Dust resolves this tier to right now. */
  modelId: string;
  locked?: "plan" | "access";
};

export const MODEL_TIERS: ModelTier[] = [
  { id: "basic", label: "Basic", modelId: "claude-3-5-haiku" },
  { id: "standard", label: "Standard", modelId: "claude-4-sonnet" },
  { id: "premium", label: "Premium", modelId: "claude-4-opus", locked: "plan" },
];

export const DEFAULT_TIER_ID: ModelTierId = "standard";

export const TIER_LOCK_TOOLTIPS: Record<
  NonNullable<ModelTier["locked"]>,
  string
> = {
  plan: "This option isn't available on your workspace's current plan. Contact your administrator to upgrade.",
  access:
    "Your current model access doesn't include this option. Contact your administrator to get access.",
};

export function getModelById(id: string): MockModel {
  return mockModels.find((model) => model.id === id) ?? mockModels[0];
}

// ---------------------------------------------------------------------------
// Spaces and Pods ("Data and access")
// ---------------------------------------------------------------------------

export type BuilderSpace = {
  id: string;
  name: string;
  description: string;
  kind: "space" | "pod";
  isRestricted: boolean;
  /** The workspace-wide space can never be removed from an agent. */
  isGlobal?: boolean;
  /** Already attached to another resource; the picker shows it disabled. */
  isUsedElsewhere?: boolean;
};

export const mockBuilderSpaces: BuilderSpace[] = [
  {
    id: "space-company",
    name: "Company Data",
    description: "Handbook, policies and everything every employee can read",
    kind: "space",
    isRestricted: false,
    isGlobal: true,
  },
  {
    id: "space-engineering",
    name: "Engineering Docs",
    description: "Architecture notes, runbooks and postmortems",
    kind: "space",
    isRestricted: false,
  },
  {
    id: "space-sales",
    name: "Sales Library",
    description: "Decks, battlecards and pricing for the field",
    kind: "space",
    isRestricted: false,
  },
  {
    id: "space-finance",
    name: "Finance",
    description: "Board decks, forecasts and closing checklists",
    kind: "space",
    isRestricted: true,
  },
  {
    id: "space-people",
    name: "People & Legal",
    description: "Contracts, compensation bands and HR templates",
    kind: "space",
    isRestricted: true,
  },
  {
    id: "space-support",
    name: "Support Knowledge",
    description: "Macros, escalation paths and product FAQs",
    kind: "space",
    isRestricted: false,
    isUsedElsewhere: true,
  },
  {
    id: "pod-q4-launch",
    name: "Q4 Launch",
    description: "Everything about the October release",
    kind: "pod",
    isRestricted: false,
  },
  {
    id: "pod-growth",
    name: "Growth experiments",
    description: "Weekly tests, dashboards and learnings",
    kind: "pod",
    isRestricted: false,
  },
  {
    id: "pod-security-review",
    name: "Security review",
    description: "Audit findings and remediation tracking",
    kind: "pod",
    isRestricted: true,
  },
  {
    id: "pod-onboarding",
    name: "Onboarding revamp",
    description: "New-hire journey redesign",
    kind: "pod",
    isRestricted: false,
  },
];

export function getBuilderSpaceById(id: string): BuilderSpace | undefined {
  return mockBuilderSpaces.find((space) => space.id === id);
}

// ---------------------------------------------------------------------------
// Capabilities: tools and skills
// ---------------------------------------------------------------------------

/**
 * The configuration a tool asks for before it can be added, as the
 * "Configure {tool}" page lays it out. A tool with no entry is added directly.
 */
export type ToolConfigurationKind =
  | "child_agent"
  | "time_frame"
  | "dust_app"
  | "pod"
  | "secret"
  | "json_schema"
  | "additional";

const TOOL_CONFIGURATION: Record<string, ToolConfigurationKind[]> = {
  "tool-internal-api": ["secret", "additional"],
  "tool-warehouse": ["time_frame", "json_schema"],
  "tool-runbooks": ["dust_app"],
  "tool-browser": ["additional"],
};

export function getToolConfigurationKinds(
  toolId: string
): ToolConfigurationKind[] {
  return TOOL_CONFIGURATION[toolId] ?? [];
}

export const activeTools = mockTools;
export const activeSkills = mockManagedSkills.filter(
  (skill) => skill.status === "active"
);

/** Logos lining the empty "Capabilities and knowledge" card, as in the product. */
export const CAPABILITY_LOGO_STRIP: IconComponent[] = [
  NotionLogo,
  ConfluenceLogo,
  SlackLogo,
  SnowflakeLogo,
  MicrosoftLogo,
  JiraLogo,
  GithubLogo,
  LinearLogo,
  GmailLogo,
  SalesforceLogo,
  HubspotLogo,
  DriveLogo,
];

export const mockChildAgents = mockAgents.slice(0, 8);

export type MockDustApp = {
  id: string;
  name: string;
  description: string;
  spaceId: string;
};
export const mockDustApps: MockDustApp[] = [
  {
    id: "app-lead-scoring",
    name: "Lead scoring",
    description: "Scores inbound leads from CRM fields",
    spaceId: "space-sales",
  },
  {
    id: "app-release-notes",
    name: "Release notes writer",
    description: "Drafts release notes from merged PRs",
    spaceId: "space-engineering",
  },
  {
    id: "app-churn-risk",
    name: "Churn risk",
    description: "Flags accounts likely to churn next quarter",
    spaceId: "space-sales",
  },
];

export type MockSecret = { id: string; name: string; createdAt: string };
export const mockSecrets: MockSecret[] = [
  { id: "secret-stripe", name: "STRIPE_API_KEY", createdAt: "Sep 12, 2026" },
  {
    id: "secret-internal",
    name: "INTERNAL_API_TOKEN",
    createdAt: "Aug 3, 2026",
  },
  { id: "secret-datadog", name: "DATADOG_APP_KEY", createdAt: "Jul 28, 2026" },
];

export const TIME_FRAME_UNITS = [
  "hour",
  "day",
  "week",
  "month",
  "year",
] as const;
export type TimeFrameUnit = (typeof TIME_FRAME_UNITS)[number];

// ---------------------------------------------------------------------------
// Knowledge: data sources
// ---------------------------------------------------------------------------

export type KnowledgeNodeKind = "connection" | "folder" | "document" | "table";

export type KnowledgeNode = {
  id: string;
  title: string;
  kind: KnowledgeNodeKind;
  icon: IconComponent;
  /** The space or pod the source lives in. */
  spaceId: string;
  parentId: string | null;
};

const knowledgeNodes: KnowledgeNode[] = [
  // Company Data
  {
    id: "ds-notion",
    title: "Notion",
    kind: "connection",
    icon: NotionLogo,
    spaceId: "space-company",
    parentId: null,
  },
  {
    id: "ds-notion-handbook",
    title: "Employee handbook",
    kind: "folder",
    icon: NotionLogo,
    spaceId: "space-company",
    parentId: "ds-notion",
  },
  {
    id: "ds-notion-handbook-pto",
    title: "PTO policy",
    kind: "document",
    icon: NotionLogo,
    spaceId: "space-company",
    parentId: "ds-notion-handbook",
  },
  {
    id: "ds-notion-handbook-expenses",
    title: "Expense policy",
    kind: "document",
    icon: NotionLogo,
    spaceId: "space-company",
    parentId: "ds-notion-handbook",
  },
  {
    id: "ds-notion-okrs",
    title: "Company OKRs 2026",
    kind: "document",
    icon: NotionLogo,
    spaceId: "space-company",
    parentId: "ds-notion",
  },
  {
    id: "ds-drive",
    title: "Google Drive",
    kind: "connection",
    icon: DriveLogo,
    spaceId: "space-company",
    parentId: null,
  },
  {
    id: "ds-drive-allhands",
    title: "All-hands decks",
    kind: "folder",
    icon: DriveLogo,
    spaceId: "space-company",
    parentId: "ds-drive",
  },
  {
    id: "ds-drive-allhands-sep",
    title: "All-hands September",
    kind: "document",
    icon: DriveLogo,
    spaceId: "space-company",
    parentId: "ds-drive-allhands",
  },
  {
    id: "ds-drive-headcount",
    title: "Headcount plan",
    kind: "table",
    icon: DriveLogo,
    spaceId: "space-company",
    parentId: "ds-drive",
  },
  {
    id: "ds-slack",
    title: "Slack",
    kind: "connection",
    icon: SlackLogo,
    spaceId: "space-company",
    parentId: null,
  },
  {
    id: "ds-slack-general",
    title: "#general",
    kind: "folder",
    icon: SlackLogo,
    spaceId: "space-company",
    parentId: "ds-slack",
  },
  {
    id: "ds-slack-announcements",
    title: "#announcements",
    kind: "folder",
    icon: SlackLogo,
    spaceId: "space-company",
    parentId: "ds-slack",
  },
  // Engineering Docs
  {
    id: "ds-confluence",
    title: "Confluence",
    kind: "connection",
    icon: ConfluenceLogo,
    spaceId: "space-engineering",
    parentId: null,
  },
  {
    id: "ds-confluence-runbooks",
    title: "Runbooks",
    kind: "folder",
    icon: ConfluenceLogo,
    spaceId: "space-engineering",
    parentId: "ds-confluence",
  },
  {
    id: "ds-confluence-runbooks-oncall",
    title: "On-call playbook",
    kind: "document",
    icon: ConfluenceLogo,
    spaceId: "space-engineering",
    parentId: "ds-confluence-runbooks",
  },
  {
    id: "ds-confluence-adr",
    title: "Architecture decisions",
    kind: "folder",
    icon: ConfluenceLogo,
    spaceId: "space-engineering",
    parentId: "ds-confluence",
  },
  {
    id: "ds-github",
    title: "GitHub",
    kind: "connection",
    icon: GithubLogo,
    spaceId: "space-engineering",
    parentId: null,
  },
  {
    id: "ds-github-front",
    title: "dust-tt/front",
    kind: "folder",
    icon: GithubLogo,
    spaceId: "space-engineering",
    parentId: "ds-github",
  },
  {
    id: "ds-github-core",
    title: "dust-tt/core",
    kind: "folder",
    icon: GithubLogo,
    spaceId: "space-engineering",
    parentId: "ds-github",
  },
  // Sales Library
  {
    id: "ds-salesforce",
    title: "Salesforce",
    kind: "connection",
    icon: SalesforceLogo,
    spaceId: "space-sales",
    parentId: null,
  },
  {
    id: "ds-salesforce-opps",
    title: "Opportunities",
    kind: "table",
    icon: SalesforceLogo,
    spaceId: "space-sales",
    parentId: "ds-salesforce",
  },
  {
    id: "ds-salesforce-accounts",
    title: "Accounts",
    kind: "table",
    icon: SalesforceLogo,
    spaceId: "space-sales",
    parentId: "ds-salesforce",
  },
  {
    id: "ds-snowflake",
    title: "Snowflake",
    kind: "connection",
    icon: SnowflakeLogo,
    spaceId: "space-sales",
    parentId: null,
  },
  {
    id: "ds-snowflake-revenue",
    title: "REVENUE_DAILY",
    kind: "table",
    icon: SnowflakeLogo,
    spaceId: "space-sales",
    parentId: "ds-snowflake",
  },
  {
    id: "ds-snowflake-pipeline",
    title: "PIPELINE_SNAPSHOT",
    kind: "table",
    icon: SnowflakeLogo,
    spaceId: "space-sales",
    parentId: "ds-snowflake",
  },
  // Q4 Launch pod
  {
    id: "ds-pod-launch-plan",
    title: "Launch plan",
    kind: "document",
    icon: NotionLogo,
    spaceId: "pod-q4-launch",
    parentId: null,
  },
  {
    id: "ds-pod-launch-faq",
    title: "Press FAQ",
    kind: "document",
    icon: DriveLogo,
    spaceId: "pod-q4-launch",
    parentId: null,
  },
  // Growth pod
  {
    id: "ds-pod-growth-tests",
    title: "Experiment log",
    kind: "table",
    icon: DriveLogo,
    spaceId: "pod-growth",
    parentId: null,
  },
];

export function getKnowledgeChildren(parentId: string | null, spaceId: string) {
  return knowledgeNodes.filter(
    (node) => node.parentId === parentId && node.spaceId === spaceId
  );
}

export function getKnowledgeNodeById(id: string): KnowledgeNode | undefined {
  return knowledgeNodes.find((node) => node.id === id);
}

export function searchKnowledge(spaceId: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }
  return knowledgeNodes.filter(
    (node) =>
      node.spaceId === spaceId && node.title.toLowerCase().includes(needle)
  );
}

/** "Notion / Employee handbook" style location for search results. */
export function getKnowledgeLocation(node: KnowledgeNode): string {
  const parts: string[] = [];
  let current = node.parentId ? getKnowledgeNodeById(node.parentId) : undefined;
  while (current) {
    parts.unshift(current.title);
    current = current.parentId
      ? getKnowledgeNodeById(current.parentId)
      : undefined;
  }
  return parts.join(" / ");
}

export const KNOWLEDGE_METHODS = [
  { id: "search", label: "Content search" },
  { id: "tables", label: "Analytics (tables, spreadsheets...)" },
  { id: "include", label: "Include all data" },
  { id: "extract", label: "Advanced processing" },
] as const;
export type KnowledgeMethodId = (typeof KNOWLEDGE_METHODS)[number]["id"];

export const KNOWLEDGE_PAGE_TITLES: Record<KnowledgeMethodId, string> = {
  search: "Configure knowledge",
  tables: "Configure Query Tables",
  include: "Configure Include Data",
  extract: "Configure Extract Data",
};

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

export type WebhookSource = {
  id: string;
  name: string;
  logo: IconComponent;
  events: string[];
  /** A source without a provider only offers a raw filter expression. */
  hasProvider: boolean;
};

export const mockWebhookSources: WebhookSource[] = [
  {
    id: "wh-github",
    name: "GitHub",
    logo: GithubLogo,
    events: ["pull_request.opened", "pull_request.merged", "issues.opened"],
    hasProvider: true,
  },
  {
    id: "wh-linear",
    name: "Linear",
    logo: LinearLogo,
    events: ["Issue created", "Issue updated", "Comment created"],
    hasProvider: true,
  },
  {
    id: "wh-zendesk",
    name: "Zendesk",
    logo: ZendeskLogo,
    events: ["Ticket created", "Ticket solved"],
    hasProvider: true,
  },
  {
    id: "wh-custom",
    name: "Custom webhook",
    logo: Clock,
    events: [],
    hasProvider: false,
  },
];

export type BuilderTrigger = {
  id: string;
  name: string;
  kind: "schedule" | "webhook";
  status: "enabled" | "disabled";
  editorId: string;
  /** Natural-language schedule request and its resolved description. */
  scheduleText?: string;
  scheduleLabel?: string;
  webhookSourceId?: string;
  event?: string;
  filter?: string;
  message?: string;
  includePayload?: boolean;
  pool: "member" | "workspace";
  rateLimit?: number;
  podId?: string | null;
};

export const WEBHOOK_REQUEST_STATUSES = [
  "Succeeded",
  "Failed",
  "Not matched",
  "Rate limited",
  "Out of credits",
] as const;

export const mockRequestHistory = [
  { id: "req-1", at: "Today, 9:12 AM", status: "Succeeded" },
  { id: "req-2", at: "Today, 8:40 AM", status: "Not matched" },
  { id: "req-3", at: "Yesterday, 6:05 PM", status: "Succeeded" },
  { id: "req-4", at: "Yesterday, 2:22 PM", status: "Rate limited" },
  { id: "req-5", at: "Oct 6, 11:48 AM", status: "Failed" },
  { id: "req-6", at: "Oct 5, 4:31 PM", status: "Out of credits" },
] as const;

/** Other members' triggers, listed under the collapsible. */
export const mockOtherMembersTriggers: BuilderTrigger[] = [
  {
    id: "trigger-other-1",
    name: "Daily pipeline digest",
    kind: "schedule",
    status: "enabled",
    editorId: mockUsers[3].id,
    scheduleLabel: "Every weekday at 8:00 AM",
    pool: "workspace",
  },
  {
    id: "trigger-other-2",
    name: "Escalated tickets",
    kind: "webhook",
    status: "disabled",
    editorId: mockUsers[5].id,
    webhookSourceId: "wh-zendesk",
    event: "Ticket created",
    pool: "member",
  },
];

/** Turns a natural-language request into the "schedule" the product echoes back. */
export function describeSchedule(text: string): string {
  const lower = text.toLowerCase();
  if (!lower.trim()) {
    return "";
  }
  if (lower.includes("monday")) {
    return "Every Monday at 9:00 AM (Europe/Paris)";
  }
  if (lower.includes("business") || lower.includes("weekday")) {
    return "Every weekday at 5:00 PM (Europe/Paris)";
  }
  if (lower.includes("hour")) {
    return "Every hour, on the hour (Europe/Paris)";
  }
  if (lower.includes("week")) {
    return "Every Friday at 10:00 AM (Europe/Paris)";
  }
  if (lower.includes("month")) {
    return "On the 1st of every month at 9:00 AM (Europe/Paris)";
  }
  return "Every day at 9:00 AM (Europe/Paris)";
}

export const NEXT_OCCURRENCES = [
  "Fri, Oct 10, 9:00 AM",
  "Mon, Oct 13, 9:00 AM",
  "Tue, Oct 14, 9:00 AM",
  "Wed, Oct 15, 9:00 AM",
  "Thu, Oct 16, 9:00 AM",
];

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type BuilderTag = {
  id: string;
  name: string;
  /** Dot color shown next to the tag in the picker. */
  color: string;
  isProtected?: boolean;
};

export const mockTags: BuilderTag[] = [
  { id: "tag-sales", name: "Sales", color: "bg-emerald-500" },
  { id: "tag-engineering", name: "Engineering", color: "bg-blue-500" },
  { id: "tag-support", name: "Support", color: "bg-amber-500" },
  { id: "tag-marketing", name: "Marketing", color: "bg-pink-500" },
  { id: "tag-hr", name: "People", color: "bg-violet-500" },
  { id: "tag-finance", name: "Finance", color: "bg-teal-500" },
  { id: "tag-productivity", name: "Productivity", color: "bg-orange-500" },
  {
    id: "tag-official",
    name: "Official",
    color: "bg-red-500",
    isProtected: true,
  },
  { id: "tag-writing", name: "Writing", color: "bg-sky-500" },
  { id: "tag-research", name: "Research", color: "bg-indigo-500" },
];

export const SUGGESTED_TAG_IDS = [
  "tag-productivity",
  "tag-writing",
  "tag-research",
];

export const mockSlackChannels = [
  { id: "ch-general", name: "#general" },
  { id: "ch-support", name: "#support" },
  { id: "ch-sales", name: "#sales" },
  { id: "ch-eng", name: "#engineering" },
  { id: "ch-random", name: "#random" },
  { id: "ch-launch", name: "#q4-launch" },
];

export const AVATAR_COLORS = [
  "bg-pink-300",
  "bg-rose-300",
  "bg-orange-300",
  "bg-amber-300",
  "bg-lime-300",
  "bg-emerald-300",
  "bg-sky-300",
  "bg-blue-300",
  "bg-violet-300",
  "bg-gray-300",
];

export const AVATAR_EMOJIS = [
  "🤖",
  "🧠",
  "🚀",
  "📊",
  "✍️",
  "🔍",
  "🛠️",
  "💡",
  "🎯",
  "📚",
];

/** Droid and spirit galleries, rendered as emoji avatars. */
export const DROID_AVATARS = [
  "🤖",
  "🦾",
  "🛸",
  "👾",
  "🪐",
  "⚙️",
  "🔋",
  "📡",
  "🧲",
  "🔭",
  "🛰️",
  "💾",
  "🖥️",
  "🎛️",
  "🧮",
  "🔌",
];
export const SPIRIT_AVATARS = [
  "🐉",
  "🦊",
  "🦉",
  "🐺",
  "🦋",
  "🐢",
  "🦅",
  "🐙",
  "🦁",
  "🐬",
  "🦄",
  "🐝",
  "🦚",
  "🐧",
  "🦦",
  "🐳",
];

// ---------------------------------------------------------------------------
// Instructions
// ---------------------------------------------------------------------------

export const INSTRUCTIONS_MAX_CHARS = 120_000;

export type InstructionVersion = {
  id: string;
  label: string;
  authorName: string;
};

export const mockInstructionVersions: InstructionVersion[] = [
  {
    id: "v-current",
    label: "Oct 8, 2026 at 4:12 PM",
    authorName: mockUsers[0].fullName,
  },
  {
    id: "v-3",
    label: "Oct 2, 2026 at 11:40 AM",
    authorName: mockUsers[1].fullName,
  },
  {
    id: "v-2",
    label: "Sep 24, 2026 at 3:05 PM",
    authorName: mockUsers[2].fullName,
  },
  { id: "v-1", label: "Sep 18, 2026 at 9:30 AM", authorName: "System" },
];

export const mockSimilarAgents = mockAgents.slice(3, 6);

export const INSTRUCTIONS_PLACEHOLDER =
  "What is the purpose of the agent? How should it behave?";

export const JSON_SCHEMA_EXAMPLE = `{
  "type": "object",
  "properties": {
    "summary": { "type": "string" },
    "sentiment": { "type": "string", "enum": ["positive", "neutral", "negative"] },
    "action_items": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["summary", "sentiment"]
}`;

export function suggestNames(): string[] {
  return ["ReleaseScribe", "SupportPilot", "DealDesk", "OnboardingBuddy"];
}

export function suggestDescriptions(): string[] {
  return [
    "Turns merged pull requests into customer-ready release notes.",
    "Answers support questions from the help center and escalates edge cases.",
    "Prepares deal reviews from CRM data and call notes.",
  ];
}

export function validateAgentName(name: string): string | null {
  if (!name.trim()) {
    return "Agent name cannot be empty.";
  }
  if (name.length > 40) {
    return "Agent name must be at most 40 characters.";
  }
  if (/\s/.test(name)) {
    return "Agent name cannot contain spaces.";
  }
  return null;
}
