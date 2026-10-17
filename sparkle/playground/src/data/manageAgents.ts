import { FLEET_TOOLS } from "./fleetTools";
import type { FleetUsage } from "./fleetUsage";
import { makeFleetUsage } from "./fleetUsage";
import { mockUsers } from "./users";

// Mirrors `LightAgentConfigurationType` from front, reduced to what the
// Manage Agents table actually renders.

export type AgentScope = "global" | "visible" | "hidden";

export type AgentStatus =
  | "active"
  | "archived"
  | "disabled_by_admin"
  | "disabled_missing_datasource";

export type ModelMakerId =
  | "anthropic"
  | "openai"
  | "google_ai_studio"
  | "mistral"
  | "deepseek"
  | "xai"
  | "noop";

export interface AgentTag {
  sId: string;
  name: string;
  kind: "standard" | "protected";
}

export interface AgentEditor {
  sId: string;
  fullName: string;
  image?: string;
}

export interface AgentModel {
  modelId: string;
  displayName: string;
  maker: ModelMakerId;
}

export interface ManagedAgent {
  sId: string;
  name: string;
  description: string;
  emoji: string;
  backgroundColor: string;
  scope: AgentScope;
  status: AgentStatus;
  modelId: string;
  editors: AgentEditor[];
  tags: AgentTag[];
  // MCP server view ids, see `fleetTools.ts`.
  tools: string[];
  usage: FleetUsage;
  feedbacks: { up: number; down: number };
  lastUpdate: number;
  canEdit: boolean;
}

export const AGENT_USAGE_PERIOD_SEC = 30 * 24 * 60 * 60;

// ── Models ────────────────────────────────────────────────────────────────────

export const AGENT_MODELS: AgentModel[] = [
  {
    modelId: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    maker: "anthropic",
  },
  {
    modelId: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    maker: "anthropic",
  },
  {
    modelId: "claude-opus-4-7",
    displayName: "Claude Opus 4.7",
    maker: "anthropic",
  },
  {
    modelId: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    maker: "anthropic",
  },
  { modelId: "gpt-5-2", displayName: "GPT-5.2", maker: "openai" },
  { modelId: "gpt-5-2-mini", displayName: "GPT-5.2 mini", maker: "openai" },
  { modelId: "o4", displayName: "o4", maker: "openai" },
  {
    modelId: "gemini-3-pro",
    displayName: "Gemini 3 Pro",
    maker: "google_ai_studio",
  },
  {
    modelId: "gemini-3-flash",
    displayName: "Gemini 3 Flash",
    maker: "google_ai_studio",
  },
  {
    modelId: "mistral-large-3",
    displayName: "Mistral Large 3",
    maker: "mistral",
  },
  { modelId: "deepseek-v4", displayName: "DeepSeek V4", maker: "deepseek" },
  { modelId: "grok-5", displayName: "Grok 5", maker: "xai" },
  { modelId: "auto", displayName: "Dust Auto", maker: "noop" },
];

export const AGENT_MODELS_BY_ID = new Map(
  AGENT_MODELS.map((model) => [model.modelId, model])
);

// The distribution is deliberately lopsided: real workspaces overwhelmingly
// sit on one or two models.
const MODEL_WEIGHTS: { modelId: string; weight: number }[] = [
  { modelId: "claude-sonnet-4-6", weight: 62 },
  { modelId: "claude-opus-4-6", weight: 12 },
  { modelId: "claude-opus-4-7", weight: 6 },
  { modelId: "claude-haiku-4-5", weight: 3 },
  { modelId: "gpt-5-2", weight: 6 },
  { modelId: "gpt-5-2-mini", weight: 2 },
  { modelId: "o4", weight: 1 },
  { modelId: "gemini-3-pro", weight: 3 },
  { modelId: "gemini-3-flash", weight: 1 },
  { modelId: "mistral-large-3", weight: 2 },
  { modelId: "deepseek-v4", weight: 1 },
  { modelId: "grok-5", weight: 1 },
];

// ── Tags ──────────────────────────────────────────────────────────────────────

export const AGENT_TAGS: AgentTag[] = [
  { sId: "tag_gtm", name: "GTM", kind: "standard" },
  { sId: "tag_marketing", name: "Marketing", kind: "standard" },
  { sId: "tag_talent", name: "Talent", kind: "standard" },
  { sId: "tag_engineering", name: "Engineering", kind: "standard" },
  { sId: "tag_product", name: "Product", kind: "standard" },
  { sId: "tag_finance", name: "Finance", kind: "standard" },
  { sId: "tag_support", name: "Support", kind: "standard" },
  { sId: "tag_legal", name: "Legal", kind: "standard" },
  { sId: "tag_data", name: "Data", kind: "standard" },
  { sId: "tag_ops", name: "Ops", kind: "standard" },
  { sId: "tag_people", name: "People", kind: "standard" },
  { sId: "tag_security", name: "Security", kind: "standard" },
  { sId: "tag_company", name: "Company", kind: "protected" },
];

const TAGS_BY_NAME = new Map(AGENT_TAGS.map((tag) => [tag.name, tag]));

function tagsFor(names: string[]): AgentTag[] {
  return names.flatMap((name) => {
    const tag = TAGS_BY_NAME.get(name);
    return tag ? [tag] : [];
  });
}

// ── Deterministic pseudo-randomness ───────────────────────────────────────────

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// ── Editors ───────────────────────────────────────────────────────────────────

const EDITOR_POOL: AgentEditor[] = mockUsers.map((user) => ({
  sId: user.id,
  fullName: user.fullName,
  image: user.portrait,
}));

export const CURRENT_USER: AgentEditor = EDITOR_POOL[0];

// ── Avatars ───────────────────────────────────────────────────────────────────

const AVATAR_EMOJIS = [
  "🤖",
  "🎯",
  "📊",
  "🧠",
  "🔍",
  "📝",
  "⚡️",
  "🧪",
  "📮",
  "🗂",
  "🛰",
  "🧭",
  "💡",
  "🪄",
  "📈",
  "🧰",
  "🛠",
  "🔮",
  "🧵",
  "🚀",
  "🦉",
  "🐙",
  "🦊",
  "🐝",
  "🍀",
  "🌊",
  "🔥",
  "🎨",
  "🎙",
  "📅",
];

const AVATAR_BACKGROUNDS = [
  "bg-blue-100",
  "bg-blue-200",
  "bg-green-100",
  "bg-green-200",
  "bg-golden-100",
  "bg-golden-200",
  "bg-rose-100",
  "bg-rose-200",
  "bg-violet-100",
  "bg-violet-200",
  "bg-lime-100",
  "bg-pink-100",
  "bg-red-100",
  "bg-highlight-100",
  "bg-primary-200",
];

// ── Curated agents (verbatim shapes from a real workspace) ────────────────────

type CuratedAgent = {
  name: string;
  description: string;
  emoji: string;
  backgroundColor: string;
  modelId?: string;
  tags?: string[];
  tools?: string[];
  usage: number;
  feedbacks?: { up: number; down: number };
  lastUpdate: string;
  scope?: AgentScope;
  canEdit?: boolean;
};

const CURATED_AGENTS: CuratedAgent[] = [
  {
    name: "AccountExecutive-Scorecard-Generator",
    tools: ["extract_data", "search"],
    description:
      "Recruiter Screen Scorecard Assistant: evaluate candidates against criteria, produce structured scorecard assessments for Ashby.",
    emoji: "🤖",
    backgroundColor: "bg-blue-100",
    tags: ["Talent"],
    usage: 4,
    lastUpdate: "2026-07-18",
  },
  {
    name: "AccountPenetrationEngine",
    tools: ["salesforce", "web_search", "extract_data"],
    description:
      "Account Penetration Engine: autonomous data extraction and analysis agent for strategic insights.",
    emoji: "🛰",
    backgroundColor: "bg-lime-100",
    modelId: "claude-opus-4-6",
    usage: 0,
    lastUpdate: "2026-03-04",
  },
  {
    name: "AccountPenetrationRenderer",
    tools: ["frame", "run_agent"],
    description:
      "Account Penetration Renderer: a template population agent that inserts JSON data into a Dust Frame template for rendering.",
    emoji: "🎨",
    backgroundColor: "bg-green-200",
    modelId: "claude-opus-4-6",
    usage: 0,
    lastUpdate: "2026-03-04",
  },
  {
    name: "Accounts_Receivable_Analyst",
    tools: ["stripe", "gmail", "search"],
    description:
      "Fetches overdue invoices, groups by client, creates Gmail drafts with payment links for Finance to review and send.",
    emoji: "📮",
    backgroundColor: "bg-rose-100",
    tags: ["Finance"],
    usage: 2,
    lastUpdate: "2026-07-02",
  },
  {
    name: "AccountSnapshot",
    tools: ["salesforce", "gong", "web_search", "search"],
    description:
      "Specialized assistant creating detailed B2B account briefings for sales meeting preparation.",
    emoji: "🍀",
    backgroundColor: "bg-golden-100",
    tags: ["GTM"],
    usage: 7,
    lastUpdate: "2025-06-21",
  },
  {
    name: "Action_Recap",
    tools: ["slack", "search"],
    description:
      "A CFO-focused agent that screens meeting notes to track action items and blockers, sending a structured Slack DM recap.",
    emoji: "🦊",
    backgroundColor: "bg-golden-200",
    tags: ["Finance"],
    usage: 4,
    lastUpdate: "2026-06-11",
  },
  {
    name: "add_event_to_Gcalendar",
    tools: ["gcal", "gmail"],
    description:
      "Assistant specialized in analyzing emails to create Google Calendar events automatically.",
    emoji: "📅",
    backgroundColor: "bg-green-200",
    usage: 2,
    lastUpdate: "2026-02-09",
  },
  {
    name: "add_event_to_Notion_calendar",
    tools: ["notion", "gcal"],
    description: "create new events in go/events",
    emoji: "📅",
    backgroundColor: "bg-green-200",
    usage: 1,
    lastUpdate: "2026-08-03",
  },
  {
    name: "AdminGovernanceExpert",
    tools: ["notion", "search"],
    description:
      "An expert agent for the Admin Governance initiative, assisting with admin roles, permissions, and documentation.",
    emoji: "🔮",
    backgroundColor: "bg-blue-200",
    tags: ["Ops", "Security"],
    usage: 8,
    lastUpdate: "2026-07-24",
  },
  {
    name: "agenda_cleaner",
    tools: ["gcal"],
    description:
      "Google Calendar assistant: cleans event titles, adds 'Task:' prefix, and changes color to pink.",
    emoji: "🧹",
    backgroundColor: "bg-blue-100",
    usage: 31,
    lastUpdate: "2026-07-29",
  },
  {
    name: "Agent_Auditor",
    tools: ["search", "run_agent"],
    description:
      "Expert AI agent auditor for enterprise workspace deployments.",
    emoji: "🔍",
    backgroundColor: "bg-blue-100",
    modelId: "claude-opus-4-7",
    usage: 25,
    feedbacks: { up: 3, down: 0 },
    lastUpdate: "2026-06-30",
  },
  {
    name: "AI-digest-news",
    tools: ["web_search", "browse"],
    description:
      "Generative AI industry monitor: research assistant tracking latest developments in AI companies, products, and research.",
    emoji: "🐼",
    backgroundColor: "bg-primary-200",
    usage: 5,
    lastUpdate: "2025-12-15",
  },
  {
    name: "AID-Scorecard",
    tools: ["extract_data", "search"],
    description:
      "Recruiter Screen Scorecard Assistant: evaluate candidates against criteria, produce structured scorecard assessments for Ashby.",
    emoji: "🤖",
    backgroundColor: "bg-blue-100",
    tags: ["Talent"],
    usage: 0,
    lastUpdate: "2026-07-18",
  },
  {
    name: "AmbraEA",
    tools: ["gcal", "gmail", "slack"],
    description:
      "Expert executive assistant AI for the Chief of Staff, managing daily workflow with precision.",
    emoji: "🧭",
    backgroundColor: "bg-blue-100",
    usage: 0,
    lastUpdate: "2026-04-14",
  },
  {
    name: "Amelie_call_",
    tools: ["gmail", "gong"],
    description: "follow-up emails after customer calls with key info.",
    emoji: "📞",
    backgroundColor: "bg-blue-100",
    tags: ["Marketing"],
    usage: 13,
    lastUpdate: "2026-03-26",
  },
  {
    name: "Analytics_Copilot",
    tools: ["snowflake", "bigquery", "data_warehouse", "frame"],
    description:
      "Answers product analytics questions over the warehouse and returns charts with the SQL it ran.",
    emoji: "📊",
    backgroundColor: "bg-violet-100",
    modelId: "claude-opus-4-6",
    tags: ["Data", "Product"],
    usage: 214,
    feedbacks: { up: 11, down: 2 },
    lastUpdate: "2026-08-05",
  },
  {
    name: "Assistant_Onboarding",
    tools: ["notion", "gcal", "search"],
    description:
      "Walks new hires through their first two weeks, surfacing the right docs, tools and people at the right time.",
    emoji: "🚀",
    backgroundColor: "bg-green-100",
    tags: ["People"],
    usage: 87,
    feedbacks: { up: 6, down: 1 },
    lastUpdate: "2026-07-11",
  },
  {
    name: "Bug_Triage",
    tools: ["github", "linear", "search"],
    description:
      "Reads incoming Sentry issues and GitHub reports, deduplicates them and proposes a severity and an owner.",
    emoji: "🐛",
    backgroundColor: "bg-red-100",
    tags: ["Engineering"],
    usage: 156,
    feedbacks: { up: 9, down: 3 },
    lastUpdate: "2026-08-07",
  },
  {
    name: "Churn_Signal_Watcher",
    tools: ["salesforce", "data_warehouse", "slack"],
    description:
      "Monitors usage drops across accounts and drafts a save play for the CSM with the supporting evidence.",
    emoji: "📉",
    backgroundColor: "bg-rose-200",
    tags: ["GTM", "Support"],
    usage: 42,
    lastUpdate: "2026-06-02",
  },
  {
    name: "Contract_Reviewer",
    tools: ["google_drive", "notion", "extract_data"],
    description:
      "Reviews inbound MSAs and DPAs against our playbook and flags the clauses that need Legal.",
    emoji: "⚖️",
    backgroundColor: "bg-golden-100",
    modelId: "claude-opus-4-7",
    tags: ["Legal"],
    usage: 63,
    feedbacks: { up: 4, down: 0 },
    lastUpdate: "2026-07-31",
  },
  {
    name: "daily_standup_digest",
    tools: ["github", "linear", "slack"],
    description:
      "Compiles yesterday's merged PRs, incidents and Linear updates into one Slack digest.",
    emoji: "☀️",
    backgroundColor: "bg-golden-200",
    tags: ["Engineering"],
    usage: 311,
    feedbacks: { up: 18, down: 1 },
    lastUpdate: "2026-08-08",
  },
  {
    name: "Deal_Desk",
    tools: ["salesforce", "search", "data_warehouse"],
    description:
      "Answers pricing, discounting and approval questions using the current commercial policy.",
    emoji: "💼",
    backgroundColor: "bg-blue-200",
    tags: ["GTM", "Finance"],
    usage: 128,
    feedbacks: { up: 7, down: 2 },
    lastUpdate: "2026-05-19",
  },
  {
    name: "Design_Critique",
    tools: ["figma", "browse"],
    description:
      "Gives structured feedback on a Figma frame: hierarchy, spacing, contrast and copy.",
    emoji: "🎨",
    backgroundColor: "bg-violet-200",
    tags: ["Product"],
    usage: 24,
    lastUpdate: "2026-04-28",
  },
  {
    name: "Docs_Gardener",
    tools: ["notion", "search"],
    description:
      "Finds stale internal documentation, proposes edits and opens the corresponding Notion tasks.",
    emoji: "🪴",
    backgroundColor: "bg-lime-100",
    tags: ["Ops"],
    usage: 19,
    lastUpdate: "2026-02-24",
  },
  {
    name: "Enterprise_RFP",
    tools: ["salesforce", "notion", "search"],
    description:
      "Drafts answers to security and procurement questionnaires from our approved answer library.",
    emoji: "📋",
    backgroundColor: "bg-blue-100",
    modelId: "gpt-5-2",
    tags: ["GTM", "Security"],
    usage: 71,
    feedbacks: { up: 5, down: 1 },
    lastUpdate: "2026-07-06",
  },
  {
    name: "Expense_Checker",
    tools: ["google_drive", "extract_data"],
    description:
      "Checks submitted expenses against the travel policy and flags the ones that need a manager review.",
    emoji: "🧾",
    backgroundColor: "bg-green-100",
    tags: ["Finance"],
    usage: 33,
    lastUpdate: "2026-01-16",
  },
  {
    name: "Incident_Commander",
    tools: ["github", "slack", "linear"],
    description:
      "Runs the incident checklist, keeps the status page updated and drafts the post-mortem skeleton.",
    emoji: "🚨",
    backgroundColor: "bg-red-100",
    modelId: "claude-opus-4-7",
    tags: ["Engineering", "Ops"],
    usage: 47,
    feedbacks: { up: 8, down: 0 },
    lastUpdate: "2026-08-01",
  },
  {
    name: "Interview_Debrief",
    tools: ["notion", "search"],
    description:
      "Turns raw interview notes into a structured debrief with evidence for each competency.",
    emoji: "🗣",
    backgroundColor: "bg-pink-100",
    tags: ["Talent"],
    usage: 58,
    lastUpdate: "2026-06-17",
  },
  {
    name: "Knowledge_Search",
    tools: ["search", "notion", "google_drive", "slack", "confluence"],
    description:
      "Searches every connected source at once and answers with citations you can open.",
    emoji: "🔎",
    backgroundColor: "bg-blue-200",
    tags: ["Company"],
    usage: 903,
    feedbacks: { up: 41, down: 6 },
    lastUpdate: "2026-08-09",
  },
  {
    name: "Localization_Buddy",
    tools: ["notion", "google_drive"],
    description:
      "Translates product copy and keeps the glossary consistent across locales.",
    emoji: "🌍",
    backgroundColor: "bg-green-200",
    modelId: "gemini-3-pro",
    tags: ["Product", "Marketing"],
    usage: 66,
    lastUpdate: "2026-03-12",
  },
  {
    name: "meeting_notes_to_crm",
    tools: ["hubspot", "gong", "search"],
    description:
      "Extracts next steps, MEDDIC fields and risks from a call transcript and writes them back to HubSpot.",
    emoji: "📝",
    backgroundColor: "bg-golden-100",
    tags: ["GTM"],
    usage: 187,
    feedbacks: { up: 12, down: 4 },
    lastUpdate: "2026-07-22",
  },
  {
    name: "Onboarding_Buddy",
    tools: ["notion", "search"],
    description:
      "Answers the questions new joiners are afraid to ask, from payroll to the coffee machine.",
    emoji: "🐣",
    backgroundColor: "bg-golden-200",
    tags: ["People"],
    usage: 145,
    feedbacks: { up: 10, down: 0 },
    lastUpdate: "2026-05-05",
  },
  {
    name: "PR_Reviewer",
    tools: ["github", "linear", "search"],
    description:
      "Reviews a pull request against our coding rules and comments only on what actually matters.",
    emoji: "🧑‍💻",
    backgroundColor: "bg-violet-100",
    modelId: "claude-opus-4-7",
    tags: ["Engineering"],
    usage: 421,
    feedbacks: { up: 27, down: 5 },
    lastUpdate: "2026-08-06",
  },
  {
    name: "Pricing_Analyst",
    tools: ["data_warehouse", "salesforce"],
    description:
      "Models the revenue impact of a pricing change and explains the assumptions behind it.",
    emoji: "💰",
    backgroundColor: "bg-lime-100",
    modelId: "claude-opus-4-6",
    tags: ["Finance", "Product"],
    usage: 29,
    lastUpdate: "2026-04-02",
  },
  {
    name: "Release_Notes_Writer",
    tools: ["github", "notion"],
    description:
      "Turns merged PRs into customer-facing release notes in our tone of voice.",
    emoji: "📣",
    backgroundColor: "bg-blue-100",
    tags: ["Product", "Marketing"],
    usage: 94,
    feedbacks: { up: 6, down: 1 },
    lastUpdate: "2026-07-14",
  },
  {
    name: "Security_Questionnaire",
    tools: ["notion", "google_drive", "search"],
    description:
      "Answers vendor security reviews using the trust center and escalates anything unanswered.",
    emoji: "🛡",
    backgroundColor: "bg-red-100",
    tags: ["Security", "Legal"],
    usage: 38,
    lastUpdate: "2026-06-25",
  },
  {
    name: "Slack_Summarizer",
    tools: ["slack", "search"],
    description:
      "Summarizes a busy channel or a long thread into the three things you actually need to know.",
    emoji: "💬",
    backgroundColor: "bg-green-100",
    modelId: "claude-haiku-4-5",
    tags: ["Company"],
    usage: 652,
    feedbacks: { up: 33, down: 8 },
    lastUpdate: "2026-08-04",
  },
  {
    name: "Support_Triage",
    tools: ["zendesk", "intercom", "search"],
    description:
      "Classifies inbound Zendesk tickets, drafts a first reply and routes the hard ones to a human.",
    emoji: "🎧",
    backgroundColor: "bg-blue-200",
    tags: ["Support"],
    usage: 388,
    feedbacks: { up: 21, down: 9 },
    lastUpdate: "2026-08-02",
  },
  {
    name: "weekly_business_review",
    tools: ["data_warehouse", "snowflake", "frame", "salesforce"],
    description:
      "Assembles the weekly metrics pack and writes the narrative around the numbers.",
    emoji: "📈",
    backgroundColor: "bg-violet-200",
    modelId: "claude-opus-4-6",
    tags: ["Data", "Company"],
    usage: 76,
    feedbacks: { up: 5, down: 0 },
    lastUpdate: "2026-08-10",
  },
  {
    name: "Zendesk_Macro_Writer",
    tools: ["zendesk", "search"],
    description:
      "Proposes new macros based on the tickets that keep coming back.",
    emoji: "🧰",
    backgroundColor: "bg-golden-100",
    tags: ["Support"],
    usage: 11,
    lastUpdate: "2026-01-29",
  },
];

// ── Generated agents ──────────────────────────────────────────────────────────

const NAME_DOMAINS = [
  "Account",
  "Analytics",
  "Billing",
  "Campaign",
  "Candidate",
  "Changelog",
  "Compliance",
  "Content",
  "Customer",
  "Dashboard",
  "Data",
  "Demo",
  "Doc",
  "Email",
  "Escalation",
  "Feedback",
  "Forecast",
  "Growth",
  "Hiring",
  "Incident",
  "Insight",
  "Invoice",
  "Lead",
  "Legal",
  "Meeting",
  "Metrics",
  "Onboarding",
  "Outbound",
  "Partner",
  "Payroll",
  "Pipeline",
  "Playbook",
  "Podcast",
  "Pricing",
  "Product",
  "Prospect",
  "Quality",
  "Recruiting",
  "Release",
  "Renewal",
  "Report",
  "Research",
  "Revenue",
  "Roadmap",
  "Runbook",
  "Sales",
  "Security",
  "Sprint",
  "Support",
  "Survey",
  "Ticket",
  "Training",
  "Usage",
  "Vendor",
  "Webinar",
];

const NAME_ROLES = [
  "Agent",
  "Analyst",
  "Assistant",
  "Auditor",
  "Bot",
  "Builder",
  "Checker",
  "Coach",
  "Copilot",
  "Digest",
  "Drafter",
  "Expert",
  "Extractor",
  "Finder",
  "Generator",
  "Helper",
  "Monitor",
  "Navigator",
  "Reviewer",
  "Scout",
  "Summarizer",
  "Tracker",
  "Triage",
  "Writer",
];

const DESCRIPTION_TEMPLATES = [
  (domain: string, role: string) =>
    `${domain} ${role.toLowerCase()}: pulls the relevant context from connected sources and returns a structured answer.`,
  (domain: string) =>
    `Drafts ${domain.toLowerCase()} updates for the team and posts them to the right Slack channel.`,
  (domain: string) =>
    `Answers ${domain.toLowerCase()} questions using our internal documentation, with citations.`,
  (domain: string) =>
    `Watches ${domain.toLowerCase()} data and flags anything that looks off before it becomes a problem.`,
  (domain: string, role: string) =>
    `Turns raw ${domain.toLowerCase()} notes into a clean ${role.toLowerCase()} output ready to share.`,
  (domain: string) =>
    `Runs the weekly ${domain.toLowerCase()} review and highlights what changed since last week.`,
  (domain: string) =>
    `Extracts ${domain.toLowerCase()} fields from documents and writes them back to the source of truth.`,
  (domain: string) =>
    `Helps the team move faster on ${domain.toLowerCase()} by removing the copy-paste work.`,
];

const NAME_STYLES = ["pascal", "snake", "kebab", "spaced"] as const;

function styleName(
  domain: string,
  role: string,
  style: (typeof NAME_STYLES)[number]
): string {
  switch (style) {
    case "pascal":
      return `${domain}${role}`;
    case "snake":
      return `${domain.toLowerCase()}_${role.toLowerCase()}`;
    case "kebab":
      return `${domain}-${role}`;
    default:
      return `${domain}_${role}`;
  }
}

function pick<T>(random: () => number, items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

function pickModelId(random: () => number): string {
  const total = MODEL_WEIGHTS.reduce((sum, m) => sum + m.weight, 0);
  let threshold = random() * total;
  for (const entry of MODEL_WEIGHTS) {
    threshold -= entry.weight;
    if (threshold <= 0) {
      return entry.modelId;
    }
  }
  return MODEL_WEIGHTS[0].modelId;
}

function pickEditors(random: () => number, count: number): AgentEditor[] {
  const editors: AgentEditor[] = [];
  const used = new Set<string>();
  while (editors.length < count) {
    const editor = pick(random, EDITOR_POOL);
    if (!used.has(editor.sId)) {
      used.add(editor.sId);
      editors.push(editor);
    }
  }
  return editors;
}

// ── Tools ─────────────────────────────────────────────────────────────────────

const TOOL_IDS = FLEET_TOOLS.map((tool) => tool.id);
const FLEET_TOOLS_IDS = new Set(TOOL_IDS);

// Tools that make an agent a natural API/integration target — those are the
// ones whose raw message counts are the most misleading.
const API_FACING_TOOLS = new Set([
  "salesforce",
  "hubspot",
  "zendesk",
  "intercom",
  "stripe",
  "snowflake",
  "bigquery",
  "data_warehouse",
  "extract_data",
]);

function programmaticBiasForTools(tools: string[]): number {
  return tools.some((tool) => API_FACING_TOOLS.has(tool)) ? 0.32 : 0;
}

function pickTools(random: () => number): string[] {
  const count = Math.floor(random() * 5);
  const tools: string[] = [];
  const used = new Set<string>();
  while (tools.length < count) {
    const tool = pick(random, TOOL_IDS);
    if (!used.has(tool)) {
      used.add(tool);
      tools.push(tool);
    }
  }
  return tools;
}

const NOW_MS = new Date("2026-08-10T10:00:00Z").getTime();
const FOURTEEN_MONTHS_MS = 425 * 24 * 60 * 60 * 1000;

// ── Global (Dust-provided) agents ─────────────────────────────────────────────

const GLOBAL_AGENTS: {
  name: string;
  description: string;
  modelId: string;
  emoji: string;
  backgroundColor: string;
}[] = [
  {
    name: "dust",
    description:
      "An agent with context on your company data. Use it to search across every connected source.",
    modelId: "auto",
    emoji: "🐦‍⬛",
    backgroundColor: "bg-primary-200",
  },
  {
    name: "claude-sonnet-4-6",
    description: "Anthropic's Claude Sonnet 4.6 model.",
    modelId: "claude-sonnet-4-6",
    emoji: "🧠",
    backgroundColor: "bg-golden-100",
  },
  {
    name: "claude-opus-4-6",
    description: "Anthropic's Claude Opus 4.6 model.",
    modelId: "claude-opus-4-6",
    emoji: "🧠",
    backgroundColor: "bg-golden-200",
  },
  {
    name: "claude-opus-4-7",
    description: "Anthropic's most capable model.",
    modelId: "claude-opus-4-7",
    emoji: "🧠",
    backgroundColor: "bg-golden-200",
  },
  {
    name: "claude-haiku-4-5",
    description: "Anthropic's fastest model.",
    modelId: "claude-haiku-4-5",
    emoji: "🍃",
    backgroundColor: "bg-lime-100",
  },
  {
    name: "gpt-5-2",
    description: "OpenAI's GPT-5.2 model.",
    modelId: "gpt-5-2",
    emoji: "🌀",
    backgroundColor: "bg-green-100",
  },
  {
    name: "gpt-5-2-mini",
    description: "OpenAI's smaller, faster GPT-5.2 model.",
    modelId: "gpt-5-2-mini",
    emoji: "🌀",
    backgroundColor: "bg-green-200",
  },
  {
    name: "o4",
    description: "OpenAI's reasoning model.",
    modelId: "o4",
    emoji: "🧮",
    backgroundColor: "bg-green-100",
  },
  {
    name: "gemini-3-pro",
    description: "Google's Gemini 3 Pro model.",
    modelId: "gemini-3-pro",
    emoji: "♊️",
    backgroundColor: "bg-blue-100",
  },
  {
    name: "gemini-3-flash",
    description: "Google's fast Gemini 3 Flash model.",
    modelId: "gemini-3-flash",
    emoji: "⚡️",
    backgroundColor: "bg-blue-200",
  },
  {
    name: "mistral-large-3",
    description: "Mistral's large model.",
    modelId: "mistral-large-3",
    emoji: "🇪🇺",
    backgroundColor: "bg-golden-100",
  },
  {
    name: "deepseek-v4",
    description: "DeepSeek's V4 model.",
    modelId: "deepseek-v4",
    emoji: "🐋",
    backgroundColor: "bg-blue-100",
  },
  {
    name: "grok-5",
    description: "xAI's Grok 5 model.",
    modelId: "grok-5",
    emoji: "🛸",
    backgroundColor: "bg-primary-200",
  },
  {
    name: "help",
    description: "Help on how to use Dust.",
    modelId: "claude-sonnet-4-6",
    emoji: "🙋",
    backgroundColor: "bg-blue-100",
  },
  {
    name: "notion",
    description: "An agent with context on your Notion Data.",
    modelId: "claude-sonnet-4-6",
    emoji: "📓",
    backgroundColor: "bg-primary-200",
  },
  {
    name: "slack",
    description: "An agent with context on your Slack Data.",
    modelId: "claude-sonnet-4-6",
    emoji: "💬",
    backgroundColor: "bg-violet-100",
  },
  {
    name: "googledrive",
    description: "An agent with context on your Google Drive Data.",
    modelId: "claude-sonnet-4-6",
    emoji: "📁",
    backgroundColor: "bg-golden-100",
  },
  {
    name: "github",
    description: "An agent with context on your GitHub Data.",
    modelId: "claude-sonnet-4-6",
    emoji: "🐙",
    backgroundColor: "bg-primary-200",
  },
  {
    name: "intercom",
    description: "An agent with context on your Intercom Data.",
    modelId: "claude-sonnet-4-6",
    emoji: "💠",
    backgroundColor: "bg-blue-200",
  },
  {
    name: "confluence",
    description: "An agent with context on your Confluence Data.",
    modelId: "claude-sonnet-4-6",
    emoji: "🌐",
    backgroundColor: "bg-blue-100",
  },
];

const GLOBAL_CONNECTOR_FILLERS = [
  "salesforce",
  "hubspot",
  "zendesk",
  "jira",
  "linear",
  "gong",
  "snowflake",
  "bigquery",
  "microsoft",
  "sharepoint",
  "onedrive",
  "outlook",
  "gmail",
  "gcal",
  "asana",
  "monday",
  "figma",
  "gitlab",
  "sentry",
  "datadog",
  "pagerduty",
  "stripe",
  "netsuite",
  "workday",
  "greenhouse",
  "ashby",
  "lever",
  "notiondb",
  "airtable",
  "dropbox",
  "box",
  "webcrawler",
  "websearch",
  "browse",
  "image",
];

// ── Assembly ──────────────────────────────────────────────────────────────────

const TOTAL_CUSTOM_AGENTS = 382;
const TOTAL_EDITABLE_BY_ME = 42;
const TOTAL_ARCHIVED_AGENTS = 14;

function buildCustomAgents(): ManagedAgent[] {
  const random = createRandom(20260810);
  const agents: ManagedAgent[] = [];

  for (const [index, curated] of CURATED_AGENTS.entries()) {
    const editors = pickEditors(random, 1 + Math.floor(random() * 3));
    const tools = curated.tools ?? pickTools(random);
    agents.push({
      sId: `agent_curated_${index}`,
      name: curated.name,
      description: curated.description,
      emoji: curated.emoji,
      backgroundColor: curated.backgroundColor,
      scope: curated.scope ?? "visible",
      status: "active",
      modelId: curated.modelId ?? "claude-sonnet-4-6",
      editors,
      tags: tagsFor(curated.tags ?? []),
      tools,
      usage: makeFleetUsage(random, {
        human: curated.usage,
        nowMs: NOW_MS,
        programmaticBias: programmaticBiasForTools(tools),
        dependencyBias: tools.includes("run_agent") ? 0.3 : 0,
      }),
      feedbacks: curated.feedbacks ?? { up: 0, down: 0 },
      lastUpdate: new Date(`${curated.lastUpdate}T09:12:00Z`).getTime(),
      canEdit: curated.canEdit ?? false,
    });
  }

  let index = 0;
  while (agents.length < TOTAL_CUSTOM_AGENTS) {
    const domain = pick(random, NAME_DOMAINS);
    const role = pick(random, NAME_ROLES);
    const style = pick(random, [...NAME_STYLES]);
    const name = styleName(domain, role, style);

    if (agents.some((agent) => agent.name === name)) {
      index += 1;
      continue;
    }

    const template = pick(random, DESCRIPTION_TEMPLATES);
    // Long tail: most agents are barely used, a few carry the workspace.
    const usageRoll = random();
    const messageCount =
      usageRoll < 0.45
        ? Math.floor(random() * 5)
        : usageRoll < 0.85
          ? Math.floor(random() * 60)
          : Math.floor(random() * 900);
    const feedbackCount =
      messageCount > 50 ? Math.floor(random() * 14) : Math.floor(random() * 2);
    const editors = pickEditors(random, 1 + Math.floor(random() * 4));
    const tools = pickTools(random);

    agents.push({
      sId: `agent_gen_${index}`,
      name,
      description: template(domain, role),
      emoji: pick(random, AVATAR_EMOJIS),
      backgroundColor: pick(random, AVATAR_BACKGROUNDS),
      // A minority of agents never got published.
      scope: random() < 0.12 ? "hidden" : "visible",
      status: "active",
      modelId: pickModelId(random),
      editors,
      tags:
        random() < 0.45
          ? tagsFor([pick(random, AGENT_TAGS).name]).concat(
              random() < 0.2 ? tagsFor([pick(random, AGENT_TAGS).name]) : []
            )
          : [],
      tools,
      usage: makeFleetUsage(random, {
        human: messageCount,
        nowMs: NOW_MS,
        programmaticBias: programmaticBiasForTools(tools),
        dependencyBias: tools.includes("run_agent") ? 0.3 : 0,
      }),
      feedbacks: {
        up: Math.ceil(feedbackCount * 0.75),
        down: Math.floor(feedbackCount * 0.25),
      },
      lastUpdate: NOW_MS - Math.floor(random() * FOURTEEN_MONTHS_MS),
      canEdit: false,
    });
    index += 1;
  }

  // Deduplicate tags introduced by the double-tag roll above.
  for (const agent of agents) {
    const seen = new Set<string>();
    agent.tags = agent.tags.filter((tag) => {
      if (seen.has(tag.sId)) {
        return false;
      }
      seen.add(tag.sId);
      return true;
    });
  }

  // The current user edits a fixed slice of the workspace.
  const editableRandom = createRandom(4242);
  const editableIndexes = new Set<number>();
  while (editableIndexes.size < TOTAL_EDITABLE_BY_ME) {
    editableIndexes.add(Math.floor(editableRandom() * agents.length));
  }
  for (const editableIndex of editableIndexes) {
    const agent = agents[editableIndex];
    agent.canEdit = true;
    if (!agent.editors.some((editor) => editor.sId === CURRENT_USER.sId)) {
      agent.editors = [CURRENT_USER, ...agent.editors].slice(0, 4);
    }
  }

  return agents;
}

function buildGlobalAgents(): ManagedAgent[] {
  const random = createRandom(777);
  const agents: ManagedAgent[] = GLOBAL_AGENTS.map((globalAgent, index) => ({
    sId: `agent_global_${globalAgent.name}`,
    name: globalAgent.name,
    description: globalAgent.description,
    emoji: globalAgent.emoji,
    backgroundColor: globalAgent.backgroundColor,
    scope: "global",
    // `helper` can never be disabled, everything else can.
    status: index % 9 === 5 ? "disabled_by_admin" : "active",
    modelId: globalAgent.modelId,
    editors: [],
    tags: [],
    tools: [],
    usage: makeFleetUsage(random, {
      human: Math.floor(random() * 1400),
      nowMs: NOW_MS,
      // Default agents are the ones people wire into scripts and integrations.
      programmaticBias: 0.25,
      dependencyBias: 0.1,
    }),
    feedbacks: { up: 0, down: 0 },
    lastUpdate: NOW_MS - Math.floor(random() * FOURTEEN_MONTHS_MS),
    canEdit: false,
  }));

  for (const connector of GLOBAL_CONNECTOR_FILLERS) {
    agents.push({
      sId: `agent_global_${connector}`,
      name: connector,
      description: `An agent with context on your ${connector} data.`,
      emoji: pick(random, AVATAR_EMOJIS),
      backgroundColor: pick(random, AVATAR_BACKGROUNDS),
      scope: "global",
      status: random() < 0.25 ? "disabled_missing_datasource" : "active",
      modelId: "claude-sonnet-4-6",
      editors: [],
      tags: [],
      tools: [connector].filter((tool) => FLEET_TOOLS_IDS.has(tool)),
      usage: makeFleetUsage(random, {
        human: Math.floor(random() * 300),
        nowMs: NOW_MS,
        programmaticBias: 0.2,
      }),
      feedbacks: { up: 0, down: 0 },
      lastUpdate: NOW_MS - Math.floor(random() * FOURTEEN_MONTHS_MS),
      canEdit: false,
    });
  }

  return agents;
}

function buildArchivedAgents(): ManagedAgent[] {
  const random = createRandom(1312);
  const agents: ManagedAgent[] = [];

  for (let index = 0; index < TOTAL_ARCHIVED_AGENTS; index++) {
    const domain = pick(random, NAME_DOMAINS);
    const role = pick(random, NAME_ROLES);
    const editors = pickEditors(random, 1 + Math.floor(random() * 2));
    agents.push({
      sId: `agent_archived_${index}`,
      name: styleName(domain, role, pick(random, [...NAME_STYLES])),
      description: pick(random, DESCRIPTION_TEMPLATES)(domain, role),
      emoji: pick(random, AVATAR_EMOJIS),
      backgroundColor: pick(random, AVATAR_BACKGROUNDS),
      scope: "visible",
      status: "archived",
      modelId: pickModelId(random),
      editors,
      tags: random() < 0.3 ? tagsFor([pick(random, AGENT_TAGS).name]) : [],
      tools: pickTools(random),
      usage: makeFleetUsage(random, {
        human: Math.floor(random() * 40),
        nowMs: NOW_MS,
      }),
      feedbacks: { up: 0, down: 0 },
      lastUpdate: NOW_MS - Math.floor(random() * FOURTEEN_MONTHS_MS),
      canEdit: true,
    });
  }

  return agents;
}

export const mockManagedAgents: ManagedAgent[] = [
  ...buildCustomAgents(),
  ...buildGlobalAgents(),
];

export const mockArchivedAgents: ManagedAgent[] = buildArchivedAgents();
