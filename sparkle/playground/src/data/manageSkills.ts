import { FLEET_TOOLS } from "./fleetTools";
import type { FleetUsage } from "./fleetUsage";
import { EMPTY_FLEET_USAGE, makeFleetUsage } from "./fleetUsage";
import { mockUsers } from "./users";

// Mirrors `SkillWithoutInstructionsAndToolsWithRelationsType` from front,
// reduced to what the Manage Skills table actually renders.

export type SkillAvailability =
  | "editors"
  | "workspace_users"
  | "users_and_agents";

export const SKILL_AVAILABILITIES: SkillAvailability[] = [
  "editors",
  "workspace_users",
  "users_and_agents",
];

export type SkillStatus = "active" | "archived" | "suggested";

export interface SkillEditor {
  sId: string;
  fullName: string;
  image?: string;
}

export interface SkillUsageAgent {
  sId: string;
  name: string;
  emoji: string;
  backgroundColor: string;
}

export interface SkillUsageSkill {
  sId: string;
  name: string;
  icon: string | null;
}

export interface SkillUsage {
  count: number;
  agents: SkillUsageAgent[];
  skills: SkillUsageSkill[];
}

export interface ManagedSkill {
  sId: string;
  name: string;
  userFacingDescription: string;
  icon: string | null;
  // `null` marks a Dust-provided skill (no human editor), which is what the
  // Dust badge on the avatar keys off.
  editedBy: number | null;
  availability: SkillAvailability;
  status: SkillStatus;
  isFavorite: boolean;
  canAdministrate: boolean;
  // Segmented over the last 30 days, like agents. `null` for system skills,
  // which are always active so message usage does not apply.
  messageUsage: FleetUsage | null;
  // MCP server view ids, see `fleetTools.ts`.
  tools: string[];
  updatedAt: number;
  createdAt: number;
  relations: {
    editors: SkillEditor[] | null;
    usage: SkillUsage;
  };
}

// Icon keys resolved to components in `skillIcons.tsx`.
export const SKILL_ICON_KEYS = [
  "table",
  "document",
  "search",
  "lightbulb",
  "chat",
  "presentation",
  "card",
  "chart",
  "mail",
  "calendar",
  "globe",
  "rocket",
  "scales",
  "clipboard",
  "grid",
  "wand",
  "monitor",
  "flag",
] as const;

export type SkillIconKey = (typeof SKILL_ICON_KEYS)[number];

// ── Deterministic pseudo-randomness ───────────────────────────────────────────

function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

const EDITOR_POOL: SkillEditor[] = mockUsers.map((user) => ({
  sId: user.id,
  fullName: user.fullName,
  image: user.portrait,
}));

export const CURRENT_SKILL_USER: SkillEditor = EDITOR_POOL[0];

// The signed-in user is never picked at random, so the "Editable by me" tab
// only counts the skills we explicitly assign to them.
const RANDOM_EDITOR_POOL = EDITOR_POOL.slice(1);

function pickEditors(random: () => number, count: number): SkillEditor[] {
  const editors: SkillEditor[] = [];
  const used = new Set<string>();
  while (editors.length < count) {
    const editor = pick(random, RANDOM_EDITOR_POOL);
    if (!used.has(editor.sId)) {
      used.add(editor.sId);
      editors.push(editor);
    }
  }
  return editors;
}

const NOW_MS = new Date("2026-08-10T10:00:00Z").getTime();
const FOURTEEN_MONTHS_MS = 425 * 24 * 60 * 60 * 1000;

// ── Tools ─────────────────────────────────────────────────────────────────────

const TOOL_IDS = FLEET_TOOLS.map((tool) => tool.id);

// Tools that make a skill a natural API/integration target.
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
  const count = 1 + Math.floor(random() * 3);
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

// ── Agent and skill names used by the "Used by" dropdown ──────────────────────

const USING_AGENTS: { name: string; emoji: string; backgroundColor: string }[] =
  [
    { name: "AccountSnapshot", emoji: "🍀", backgroundColor: "bg-golden-100" },
    {
      name: "Analytics_Copilot",
      emoji: "📊",
      backgroundColor: "bg-violet-100",
    },
    { name: "Bug_Triage", emoji: "🐛", backgroundColor: "bg-red-100" },
    { name: "Content_Writer", emoji: "📝", backgroundColor: "bg-blue-100" },
    { name: "Deal_Desk", emoji: "💼", backgroundColor: "bg-blue-200" },
    { name: "Enterprise_RFP", emoji: "📋", backgroundColor: "bg-blue-100" },
    { name: "Knowledge_Search", emoji: "🔎", backgroundColor: "bg-blue-200" },
    {
      name: "meeting_notes_to_crm",
      emoji: "📝",
      backgroundColor: "bg-golden-100",
    },
    { name: "PR_Reviewer", emoji: "🧑‍💻", backgroundColor: "bg-violet-100" },
    {
      name: "Release_Notes_Writer",
      emoji: "📣",
      backgroundColor: "bg-blue-100",
    },
    { name: "Support_Triage", emoji: "🎧", backgroundColor: "bg-blue-200" },
    {
      name: "weekly_business_review",
      emoji: "📈",
      backgroundColor: "bg-violet-200",
    },
  ];

// ── Curated skills (verbatim shapes from a real workspace) ────────────────────

type CuratedSkill = {
  name: string;
  description: string;
  icon: SkillIconKey;
  availability: SkillAvailability;
  agents?: number;
  skills?: number;
  tools?: string[];
  usage: number | null;
  editors: number;
  updatedAt: string;
  isDustProvided?: boolean;
  isFavorite?: boolean;
};

const CURATED_SKILLS: CuratedSkill[] = [
  {
    name: "[Agent Optimization] Create Frame",
    tools: ["frame", "run_agent"],
    description:
      "Classifies a Dust user's builder profile into one of six types and generates personalized Wrapped card copy for the Agent Optimizer frame. Enable after the Agent Optimization skills return data.",
    icon: "table",
    availability: "workspace_users",
    skills: 1,
    usage: 120,
    editors: 1,
    updatedAt: "2026-08-04",
  },
  {
    name: "[Agent Optimization] Get Details",
    tools: ["search", "run_agent"],
    description:
      "Retrieves full metadata of a Dust agent, including config, usage, and active triggers.",
    icon: "search",
    availability: "workspace_users",
    skills: 1,
    usage: 101,
    editors: 1,
    updatedAt: "2026-08-04",
  },
  {
    name: "[Agent Optimization] Get recommendation",
    tools: ["search"],
    description:
      "Audit a Dust agent's configuration and produce actionable optimization recommendations on model choice, instructions quality, architecture, capabilities, and knowledge — covering both quality and cost efficiency.",
    icon: "lightbulb",
    availability: "workspace_users",
    skills: 1,
    usage: 57,
    editors: 1,
    updatedAt: "2026-07-22",
  },
  {
    name: "[Agent Optimization] Master Skill",
    tools: ["run_agent", "search"],
    description: "Master Skill for Agent Optimization Pipeline",
    icon: "search",
    availability: "workspace_users",
    usage: 69,
    editors: 4,
    updatedAt: "2026-08-04",
  },
  {
    name: "[Area Lead] Team Weekly Presentation",
    tools: ["frame", "google_drive", "data_warehouse"],
    description:
      "Builds a branded weekly presentation frame for your area using the team template.",
    icon: "presentation",
    availability: "workspace_users",
    agents: 4,
    usage: 505,
    editors: 2,
    updatedAt: "2026-06-18",
  },
  {
    name: "[Comms] Panel Prep",
    tools: ["web_search", "browse", "notion"],
    description:
      "Create a panel prep document ahead of a conference where a public speaker representing the company is participating",
    icon: "chat",
    availability: "workspace_users",
    usage: 3,
    editors: 1,
    updatedAt: "2026-07-09",
  },
  {
    name: "[Community] Workshop Facilitator",
    tools: ["notion", "gcal"],
    description:
      "Helps plan and run technical workshops for engineer audiences at customer sites.",
    icon: "chat",
    availability: "workspace_users",
    usage: 4,
    editors: 1,
    updatedAt: "2026-06-25",
  },
  {
    name: "[Content] AI-generated detector",
    tools: ["search"],
    description:
      "Rates written content on how human or AI-generated it reads, with flagged quotes and fix recommendations.",
    icon: "search",
    availability: "users_and_agents",
    agents: 4,
    usage: 411,
    editors: 2,
    updatedAt: "2026-07-30",
  },
  {
    name: "[Content] Dust style guide",
    tools: ["notion", "search"],
    description:
      "Apply Dust's writing style and tone of voice standards to any external content — blogs, web copy, white papers, emails, and more.",
    icon: "document",
    availability: "users_and_agents",
    agents: 4,
    usage: 1873,
    editors: 3,
    updatedAt: "2026-08-07",
    isFavorite: true,
  },
  {
    name: "[Content] Review blog or customer story",
    tools: ["browse", "search"],
    description:
      "Reviews blog posts and customer stories from the perspective of a skeptical B2B buyer. Checks length, title, opening, structure, AI signal patterns, language, formatting, credibility, and factual accuracy. Returns a scorecard plus prioritized fixes.",
    icon: "document",
    availability: "users_and_agents",
    agents: 1,
    usage: 43,
    editors: 1,
    updatedAt: "2026-08-01",
  },
  {
    name: "[Content] Technical blog post",
    tools: ["github", "search"],
    description:
      "Reviews technical engineering blog drafts with prioritized, quoted feedback through six credibility lenses.",
    icon: "search",
    availability: "users_and_agents",
    usage: 5,
    editors: 1,
    updatedAt: "2026-07-15",
  },
  {
    name: "[CS] Business Review",
    tools: ["frame", "salesforce", "data_warehouse"],
    description:
      "Generates an interactive Business Review Frame for a customer. Covers 6 tabs: Review Objectives, Adoption & Metrics, ROI Analysis, Governance, Action Plan, and Product Roadmap.",
    icon: "presentation",
    availability: "users_and_agents",
    usage: 134,
    editors: 1,
    updatedAt: "2026-08-05",
  },
  {
    name: "[CS] Customer Handoff",
    tools: ["notion", "hubspot", "gong"],
    description:
      "Extracts and documents key account information from sales calls, demos, and discovery notes to produce a structured Customer Success handoff in Notion, then adds a HubSpot note and prompts for intro emails.",
    icon: "document",
    availability: "users_and_agents",
    skills: 1,
    usage: 56,
    editors: 1,
    updatedAt: "2026-07-28",
  },
  {
    name: "[CS] Handoff Readiness Check",
    tools: ["salesforce", "gong"],
    description:
      "Run before any Sales-to-CS handoff to verify all Pre-Sales signal is captured. Flags missing inputs, blocks premature handovers, and drafts AE/SE follow-ups for gaps.",
    icon: "card",
    availability: "workspace_users",
    usage: 3,
    editors: 2,
    updatedAt: "2026-07-03",
  },
  {
    name: "[CS] Kick-off",
    tools: ["notion", "gcal", "hubspot"],
    description:
      "Prepares the customer kick-off: agenda, success criteria, stakeholder map and the follow-up recap.",
    icon: "rocket",
    availability: "users_and_agents",
    skills: 1,
    usage: 157,
    editors: 1,
    updatedAt: "2026-07-21",
  },
  {
    name: "[Data] Warehouse query",
    tools: ["snowflake", "bigquery", "data_warehouse"],
    description:
      "Writes and runs SQL against the warehouse, then explains the result and the assumptions behind it.",
    icon: "table",
    availability: "users_and_agents",
    agents: 7,
    usage: 2410,
    editors: 2,
    updatedAt: "2026-08-09",
    isFavorite: true,
  },
  {
    name: "[Finance] Invoice extraction",
    tools: ["extract_data", "stripe", "google_drive"],
    description:
      "Extracts amounts, dates and payment terms from PDF invoices into a normalized structure.",
    icon: "card",
    availability: "workspace_users",
    agents: 2,
    usage: 318,
    editors: 1,
    updatedAt: "2026-06-30",
  },
  {
    name: "[GTM] Account research",
    tools: ["salesforce", "web_search", "browse", "gong"],
    description:
      "Builds a one-page account brief from public sources, the CRM and past conversations.",
    icon: "globe",
    availability: "users_and_agents",
    agents: 9,
    skills: 2,
    usage: 1642,
    editors: 3,
    updatedAt: "2026-08-08",
  },
  {
    name: "[Legal] Clause playbook",
    tools: ["google_drive", "extract_data"],
    description:
      "Compares a contract clause to our standard position and suggests the fallback language.",
    icon: "scales",
    availability: "editors",
    usage: 27,
    editors: 2,
    updatedAt: "2026-05-14",
  },
  {
    name: "[People] Interview scorecard",
    tools: ["notion", "extract_data"],
    description:
      "Turns interview notes into a structured scorecard with evidence per competency.",
    icon: "clipboard",
    availability: "workspace_users",
    agents: 3,
    usage: 209,
    editors: 2,
    updatedAt: "2026-07-17",
  },
  {
    name: "Search company knowledge",
    tools: ["search"],
    description:
      "Searches every connected data source and returns the passages that answer the question, with citations.",
    icon: "search",
    availability: "users_and_agents",
    agents: 12,
    skills: 4,
    usage: null,
    editors: 0,
    updatedAt: "2026-08-10",
    isDustProvided: true,
  },
  {
    name: "Browse the web",
    tools: ["browse", "web_search"],
    description:
      "Opens a URL and extracts its readable content so an agent can reason over it.",
    icon: "globe",
    availability: "users_and_agents",
    agents: 15,
    usage: null,
    editors: 0,
    updatedAt: "2026-08-10",
    isDustProvided: true,
  },
  {
    name: "Create a Frame",
    tools: ["frame"],
    description:
      "Builds an interactive frame — dashboards, reports, mini-apps — from data an agent already has.",
    icon: "grid",
    availability: "users_and_agents",
    agents: 8,
    skills: 3,
    usage: null,
    editors: 0,
    updatedAt: "2026-08-10",
    isDustProvided: true,
  },
  {
    name: "Run agent",
    tools: ["run_agent"],
    description:
      "Delegates a sub-task to another agent and returns its answer.",
    icon: "wand",
    availability: "users_and_agents",
    agents: 6,
    skills: 5,
    usage: null,
    editors: 0,
    updatedAt: "2026-08-10",
    isDustProvided: true,
  },
];

// ── Generated skills ──────────────────────────────────────────────────────────

const SKILL_AREAS = [
  "Analytics",
  "Brand",
  "Comms",
  "Community",
  "Content",
  "CS",
  "Data",
  "Design",
  "Eng",
  "Finance",
  "GTM",
  "Growth",
  "Legal",
  "Marketing",
  "Ops",
  "People",
  "Partnerships",
  "Product",
  "RevOps",
  "Sales",
  "Security",
  "Support",
  "Talent",
];

const SKILL_SUBJECTS = [
  "Account brief",
  "Battlecard lookup",
  "Bug reproduction",
  "Campaign brief",
  "Changelog draft",
  "Churn analysis",
  "Competitive scan",
  "Compliance check",
  "Customer quote finder",
  "Deal review",
  "Doc summarizer",
  "Email draft",
  "Escalation summary",
  "Feedback digest",
  "Forecast rollup",
  "Headcount plan",
  "Incident timeline",
  "Interview debrief",
  "Invoice lookup",
  "KPI snapshot",
  "Lead enrichment",
  "Meeting recap",
  "Metrics pack",
  "Onboarding checklist",
  "Persona research",
  "Pipeline hygiene",
  "Pricing simulation",
  "Product brief",
  "Prospect list",
  "Quarterly review",
  "Release checklist",
  "Renewal risk",
  "Roadmap update",
  "Runbook lookup",
  "Sales objection",
  "SEO audit",
  "Slack digest",
  "Survey analysis",
  "Ticket clustering",
  "Training plan",
  "Usage report",
  "Vendor review",
  "Webinar recap",
];

const SKILL_DESCRIPTION_TEMPLATES = [
  (subject: string) =>
    `Produces a ${subject.toLowerCase()} from the connected sources, formatted so it can be pasted straight into the doc.`,
  (subject: string) =>
    `Runs the ${subject.toLowerCase()} workflow end to end and returns the result with the sources it used.`,
  (subject: string) =>
    `Standardizes how we do ${subject.toLowerCase()} so every agent produces the same shape of output.`,
  (subject: string) =>
    `Collects the inputs needed for a ${subject.toLowerCase()}, flags what's missing, and drafts the rest.`,
  (subject: string) =>
    `Reusable instructions and tools for ${subject.toLowerCase()}, maintained by the owning team.`,
];

const AVAILABILITY_WEIGHTS: {
  availability: SkillAvailability;
  weight: number;
}[] = [
  { availability: "workspace_users", weight: 52 },
  { availability: "users_and_agents", weight: 34 },
  { availability: "editors", weight: 14 },
];

function pickAvailability(random: () => number): SkillAvailability {
  const total = AVAILABILITY_WEIGHTS.reduce((sum, a) => sum + a.weight, 0);
  let threshold = random() * total;
  for (const entry of AVAILABILITY_WEIGHTS) {
    threshold -= entry.weight;
    if (threshold <= 0) {
      return entry.availability;
    }
  }
  return "workspace_users";
}

const TOTAL_ACTIVE_SKILLS = 543;
const TOTAL_EDITABLE_BY_ME = 1;
const TOTAL_ARCHIVED_SKILLS = 23;
const TOTAL_SUGGESTED_SKILLS = 3;

function buildUsage(
  random: () => number,
  agentCount: number,
  skillCount: number,
  allSkillNames: string[]
): SkillUsage {
  const agents: SkillUsageAgent[] = [];
  for (let index = 0; index < agentCount; index++) {
    const agent = pick(random, USING_AGENTS);
    agents.push({
      sId: `agent_use_${index}_${Math.floor(random() * 100000)}`,
      name: agent.name,
      emoji: agent.emoji,
      backgroundColor: agent.backgroundColor,
    });
  }
  const skills: SkillUsageSkill[] = [];
  for (let index = 0; index < skillCount; index++) {
    skills.push({
      sId: `skill_use_${index}_${Math.floor(random() * 100000)}`,
      name: pick(random, allSkillNames),
      icon: pick(random, SKILL_ICON_KEYS),
    });
  }
  return { count: agentCount + skillCount, agents, skills };
}

function buildActiveSkills(): ManagedSkill[] {
  const random = createRandom(20260811);
  const skills: ManagedSkill[] = [];
  const curatedNames = CURATED_SKILLS.map((skill) => skill.name);

  for (const [index, curated] of CURATED_SKILLS.entries()) {
    const isDustProvided = curated.isDustProvided ?? false;
    const editors = isDustProvided
      ? null
      : pickEditors(random, Math.max(curated.editors, 1));
    const tools = curated.tools ?? pickTools(random);
    skills.push({
      sId: `skill_curated_${index}`,
      name: curated.name,
      userFacingDescription: curated.description,
      icon: curated.icon,
      editedBy: isDustProvided ? null : 1,
      availability: curated.availability,
      status: "active",
      isFavorite: curated.isFavorite ?? false,
      canAdministrate: !isDustProvided,
      messageUsage:
        curated.usage === null
          ? null
          : makeFleetUsage(random, {
              human: curated.usage,
              nowMs: NOW_MS,
              programmaticBias: programmaticBiasForTools(tools),
              // A skill attached to agents is a dependency by construction.
              dependencyBias: (curated.agents ?? 0) > 0 ? 0.4 : 0,
            }),
      tools,
      updatedAt: new Date(`${curated.updatedAt}T14:32:00Z`).getTime(),
      createdAt: new Date(`${curated.updatedAt}T14:32:00Z`).getTime() - 6e9,
      relations: {
        editors,
        usage: buildUsage(
          random,
          curated.agents ?? 0,
          curated.skills ?? 0,
          curatedNames
        ),
      },
    });
  }

  let index = 0;
  while (skills.length < TOTAL_ACTIVE_SKILLS) {
    const area = pick(random, SKILL_AREAS);
    const subject = pick(random, SKILL_SUBJECTS);
    const name = `[${area}] ${subject}`;

    if (skills.some((skill) => skill.name === name)) {
      index += 1;
      continue;
    }

    const usageRoll = random();
    const messageCount =
      usageRoll < 0.4
        ? Math.floor(random() * 10)
        : usageRoll < 0.85
          ? Math.floor(random() * 200)
          : Math.floor(random() * 2500);

    const updatedAt = NOW_MS - Math.floor(random() * FOURTEEN_MONTHS_MS);
    const editors = pickEditors(random, 1 + Math.floor(random() * 4));
    const tools = pickTools(random);
    const agentCount = random() < 0.55 ? Math.floor(random() * 8) : 0;

    skills.push({
      sId: `skill_gen_${index}`,
      name,
      userFacingDescription: pick(random, SKILL_DESCRIPTION_TEMPLATES)(subject),
      icon: pick(random, SKILL_ICON_KEYS),
      editedBy: 1,
      availability: pickAvailability(random),
      status: "active",
      isFavorite: false,
      canAdministrate: random() < 0.35,
      messageUsage: makeFleetUsage(random, {
        human: messageCount,
        nowMs: NOW_MS,
        programmaticBias: programmaticBiasForTools(tools),
        dependencyBias: agentCount > 0 ? 0.4 : 0,
      }),
      tools,
      updatedAt,
      createdAt: updatedAt - Math.floor(random() * 1e10),
      relations: {
        editors,
        usage: buildUsage(
          random,
          agentCount,
          random() < 0.2 ? 1 + Math.floor(random() * 3) : 0,
          curatedNames
        ),
      },
    });
    index += 1;
  }

  // The current user only edits a handful of skills.
  const editable = skills.filter((skill) => skill.editedBy !== null);
  for (let i = 0; i < TOTAL_EDITABLE_BY_ME; i++) {
    const skill = editable[i * 37];
    skill.relations.editors = [
      CURRENT_SKILL_USER,
      ...(skill.relations.editors ?? []),
    ].slice(0, 4);
    skill.canAdministrate = true;
  }

  return skills;
}

function buildArchivedSkills(): ManagedSkill[] {
  const random = createRandom(99);
  const skills: ManagedSkill[] = [];

  for (let index = 0; index < TOTAL_ARCHIVED_SKILLS; index++) {
    const area = pick(random, SKILL_AREAS);
    const subject = pick(random, SKILL_SUBJECTS);
    const updatedAt = NOW_MS - Math.floor(random() * FOURTEEN_MONTHS_MS);
    const editors = pickEditors(random, 1 + Math.floor(random() * 2));
    skills.push({
      sId: `skill_archived_${index}`,
      name: `[${area}] ${subject}`,
      userFacingDescription: pick(random, SKILL_DESCRIPTION_TEMPLATES)(subject),
      icon: pick(random, SKILL_ICON_KEYS),
      editedBy: 1,
      availability: pickAvailability(random),
      status: "archived",
      isFavorite: false,
      canAdministrate: true,
      messageUsage: makeFleetUsage(random, {
        human: Math.floor(random() * 80),
        nowMs: NOW_MS,
      }),
      tools: pickTools(random),
      updatedAt,
      createdAt: updatedAt - 5e9,
      relations: {
        editors,
        usage: { count: 0, agents: [], skills: [] },
      },
    });
  }

  return skills;
}

function buildSuggestedSkills(): ManagedSkill[] {
  const random = createRandom(555);
  const suggestions: {
    name: string;
    description: string;
    icon: SkillIconKey;
  }[] = [
    {
      name: "[Support] Ticket clustering",
      description:
        "Groups the last 30 days of tickets into themes and ranks them by volume and sentiment.",
      icon: "chart",
    },
    {
      name: "[Marketing] SEO audit",
      description:
        "Audits a page for structure, internal links and keyword coverage, then lists the fixes in order.",
      icon: "globe",
    },
    {
      name: "[Eng] Runbook lookup",
      description:
        "Finds the right runbook for an alert and walks through the steps with the current context.",
      icon: "monitor",
    },
  ];

  return suggestions
    .slice(0, TOTAL_SUGGESTED_SKILLS)
    .map((suggestion, index) => ({
      sId: `skill_suggested_${index}`,
      name: suggestion.name,
      userFacingDescription: suggestion.description,
      icon: suggestion.icon,
      editedBy: 1,
      availability: "workspace_users" as const,
      status: "suggested" as const,
      isFavorite: false,
      canAdministrate: true,
      messageUsage: EMPTY_FLEET_USAGE,
      tools: pickTools(random),
      updatedAt: NOW_MS - Math.floor(random() * 1e9),
      createdAt: NOW_MS - Math.floor(random() * 1e10),
      relations: {
        editors: null,
        usage: { count: 0, agents: [], skills: [] },
      },
    }));
}

export const mockActiveSkills: ManagedSkill[] = buildActiveSkills();
export const mockArchivedSkills: ManagedSkill[] = buildArchivedSkills();
export const mockSuggestedSkills: ManagedSkill[] = buildSuggestedSkills();
