import {
  Brackets,
  Calendar,
  CloudArrowLeftRight,
  Cube01,
  DocumentPile,
  File02,
  GithubLogo,
  Globe01,
  GoogleLogo,
  Image01,
  JiraLogo,
  LinearLogo,
  MagicWand02,
  NotionLogo,
  SalesforceLogo,
  Server03,
  SlackLogo,
  Table,
  Terminal,
  Type01,
  ZendeskLogo,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

import { mockAgents } from "./agents";
import { mockCompanySpaces } from "./companySpaces";
import type { Agent } from "./types";

// What the Build tab manages: the tools a workspace connects, the skills built
// on top of them, and the agents assembled from those skills. Each of the three
// has a table in the product, and each row of each table opens a sheet.
//
// The three are declared in that order because each one references the one
// before it. Every figure is derived from a seed rather than drawn at random,
// so a row's usage and dates stay put across renders — a table that reshuffles
// its numbers on every keystroke is unreadable.

function seededRandom(seed: string, index: number): number {
  const hash = seed
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const x = Math.sin((hash + index) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Picks `count` distinct user ids, spread through the 80 mock users. */
function seededUserIds(seed: string, count: number): string[] {
  const ids: string[] = [];
  for (let i = 0; ids.length < count && i < count * 6; i++) {
    const id = String(Math.floor(seededRandom(seed, 50 + i) * 80) + 1);
    if (!ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

function seededDaysAgo(seed: string, index: number, span: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(seededRandom(seed, index) * span));
  date.setHours(Math.floor(seededRandom(seed, index + 1) * 24), 0, 0, 0);
  return date;
}

/** Picks the entries of a list whose seeded draw falls under `probability`. */
function seededPick<T>(
  items: T[],
  seed: string,
  offset: number,
  probability: number
): T[] {
  return items.filter((_, i) => seededRandom(seed, offset + i) < probability);
}

// ── Tools ────────────────────────────────────────────────────────────────────

/** How insistently Dust asks before running a tool. */
export type ToolStake = "high" | "medium" | "low" | "never_ask";

/**
 * `label` is what the batch menus list; `longLabel` spells out the consequence
 * and is what a single operation's dropdown shows, as the product does.
 */
export const TOOL_STAKE_LEVELS: Record<
  ToolStake,
  { label: string; longLabel: string }
> = {
  high: { label: "High", longLabel: "High (always ask for confirmation)" },
  medium: {
    label: "Medium",
    longLabel: "Medium (allows input-scoped confirmation save)",
  },
  low: {
    label: "Low",
    longLabel: "Low (allows user-global confirmation save)",
  },
  never_ask: {
    label: "Never ask",
    longLabel: "Never ask (automatic execution)",
  },
};

export const TOOL_STAKES: ToolStake[] = ["high", "medium", "low", "never_ask"];

/** Whose credentials a tool runs with, or nothing when it needs none. */
export type ToolAccount = "Personal" | "Shared" | "";

/** One callable operation inside a tool, as the detail sheet lists them. */
export type ToolOperation = {
  name: string;
  description: string;
  enabled: boolean;
  stake: ToolStake;
};

/**
 * What an OAuth tool's credentials mean for the people using it — the product's
 * two use cases, with the copy it shows under "Credentials".
 */
export const TOOL_ACCOUNT_INFO: Record<
  Exclude<ToolAccount, "">,
  { label: string; description: string }
> = {
  Shared: {
    label: "Shared account",
    description: "All members will use the credentials you provide here.",
  },
  Personal: {
    label: "Personal accounts",
    description:
      "Each member logs in with their own credentials when they use the tool.",
  },
};

export type MockTool = {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  /**
   * Where the tool is hosted, for a custom MCP server the workspace pointed
   * Dust at. A built-in tool has none, and the product then offers neither the
   * URL nor the icon picker.
   */
  serverUrl: string | null;
  /** The picked icon's name, which only a custom server carries. */
  iconName: string | null;
  /**
   * Whether the tool is open to the whole workspace. When it is, the Spaces
   * below do not apply — the product hides that table entirely.
   */
  isWorkspaceWide: boolean;
  /** The Spaces the tool reaches when it is not workspace-wide. */
  spaceIds: string[];
  account: ToolAccount;
  /** An OAuth tool nobody has connected yet carries a warning chip. */
  isConnected: boolean;
  /** The granted OAuth scopes. Seeded but not surfaced anywhere yet. */
  scopes: string[];
  /** Forces the tool to be reached through a skill rather than on its own. */
  isRestrictedToSkills: boolean;
  editorId: string;
  updatedAt: Date;
  usedByAgentIds: string[];
  operations: ToolOperation[];
};

const TOOL_SEEDS: {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  account: ToolAccount;
  isConnected?: boolean;
  /** Only the OAuth tools carry scopes; the rest authenticate with nothing. */
  scopes?: string[];
  /** Set on the custom MCP servers, which are the ones an admin can re-point. */
  serverUrl?: string;
  iconName?: string;
  operations: [string, string][];
}[] = [
  {
    id: "tool-slack",
    name: "Slack",
    description: "Read channels and post messages on your behalf.",
    icon: SlackLogo,
    account: "Personal",
    scopes: ["Read messages", "Post messages", "List channels"],
    operations: [
      [
        "search_messages",
        "Search messages across every channel the connected account can read, including private channels it belongs to and its own direct messages. The query accepts Slack's own search modifiers, so an agent can narrow by author, channel or date range rather than reading a whole channel. Results come back newest first with a permalink per message, and messages the account cannot see are filtered out server-side rather than returned as errors.",
      ],
      [
        "post_message",
        "Post a message to a channel or as a reply in a thread, as the connected account rather than as a bot. The message is visible to everyone in the channel and cannot be unsent, only edited or deleted afterwards, which is why it sits behind a confirmation by default.",
      ],
      ["list_channels", "List the channels of the workspace."],
    ],
  },
  {
    id: "tool-notion",
    name: "Notion",
    description: "Search pages and databases, and create new pages.",
    icon: NotionLogo,
    account: "Shared",
    scopes: ["Read content", "Create pages", "Update pages"],
    operations: [
      ["search", "Search pages and databases."],
      ["get_page", "Read a page and its blocks."],
      ["create_page", "Create a page under a parent page."],
      ["update_page", "Change the properties of a page."],
    ],
  },
  {
    id: "tool-github",
    name: "GitHub",
    description: "Read issues and pull requests, and comment on them.",
    icon: GithubLogo,
    account: "Shared",
    scopes: ["Read repositories", "Read issues", "Write comments"],
    operations: [
      ["list_issues", "List the issues of a repository."],
      [
        "get_pull_request",
        "Read a pull request: its title and body, the commits it carries, the review comments left on it, the state of its checks and the full diff. Large diffs are truncated per file so a single pull request cannot fill the whole context window, and generated files matched by the repository's attributes are returned as a summary line instead of a patch.",
      ],
      ["create_comment", "Comment on an issue or a pull request."],
    ],
  },
  {
    id: "tool-jira",
    name: "Jira",
    description: "Read and move issues across projects and sprints.",
    icon: JiraLogo,
    account: "Personal",
    isConnected: false,
    scopes: ["Read issues", "Write issues", "Manage transitions"],
    operations: [
      ["search_issues", "Search issues with JQL."],
      ["create_issue", "Create an issue in a project."],
      ["transition_issue", "Move an issue to another status."],
    ],
  },
  {
    id: "tool-salesforce",
    name: "Salesforce",
    description: "Query accounts, opportunities and contacts.",
    icon: SalesforceLogo,
    account: "Shared",
    scopes: ["Read records", "Update records", "Run queries"],
    operations: [
      ["run_soql", "Run a SOQL query."],
      ["get_record", "Read a single record by id."],
      ["update_record", "Change the fields of a record."],
    ],
  },
  {
    id: "tool-zendesk",
    name: "Zendesk",
    description: "Read tickets and macros, and draft replies.",
    icon: ZendeskLogo,
    account: "Shared",
    scopes: ["Read tickets", "Write comments"],
    operations: [
      ["search_tickets", "Search tickets across the help desk."],
      ["get_ticket", "Read a ticket and its conversation."],
      ["add_comment", "Add a public or internal comment."],
    ],
  },
  {
    id: "tool-linear",
    name: "Linear",
    description: "Read and create issues, projects and cycles.",
    icon: LinearLogo,
    account: "Personal",
    isConnected: false,
    scopes: ["Read issues", "Create issues"],
    operations: [
      ["list_issues", "List the issues of a team."],
      ["create_issue", "Create an issue in a team."],
    ],
  },
  {
    id: "tool-google-drive",
    name: "Google Drive",
    description: "Search files and read documents and sheets.",
    icon: GoogleLogo,
    account: "Personal",
    scopes: ["Read files", "Read spreadsheets"],
    operations: [
      ["search_files", "Search the files you can read."],
      ["read_document", "Read the contents of a document."],
      ["read_sheet", "Read a range from a spreadsheet."],
    ],
  },
  {
    id: "tool-browser",
    name: "Web browser",
    description: "Open a page and read what is on it.",
    icon: Globe01,
    account: "",
    operations: [
      ["browse", "Open a URL and return its text."],
      ["search", "Search the web and return the results."],
    ],
  },
  {
    id: "tool-warehouse",
    name: "Data warehouse",
    description: "Run read-only SQL against the analytics warehouse.",
    icon: Table,
    account: "Shared",
    scopes: ["Read schema", "Run read-only queries"],
    operations: [
      ["list_schemas", "List the schemas the warehouse exposes."],
      ["list_tables", "List the tables of a schema."],
      ["describe_table", "Read the columns of a table."],
      ["preview_table", "Read the first rows of a table."],
      [
        "run_query",
        "Run a read-only SQL query against the analytics warehouse and return the rows as a table. The query runs under a role that cannot write, so any statement other than SELECT or WITH is rejected before it reaches the warehouse. Results are capped at ten thousand rows and queries are cancelled after sixty seconds, which keeps an agent from holding a warehouse slot open while it reasons about what to ask next.",
      ],
      ["explain_query", "Read the plan a query would run under."],
      ["list_saved_queries", "List the queries the team has saved."],
      ["get_saved_query", "Read a saved query and its parameters."],
      ["run_saved_query", "Run a saved query with the given parameters."],
      ["get_column_stats", "Read the distribution of a column."],
      ["list_query_history", "List the queries run against a table."],
    ],
  },
  {
    id: "tool-internal-api",
    name: "Internal API",
    description: "A custom MCP server wrapping our own back office.",
    icon: Cube01,
    account: "",
    serverUrl: "https://mcp.acme.internal/back-office/mcp",
    iconName: "ActionCubeIcon",
    operations: [
      ["get_customer", "Read a customer by id."],
      ["search_customers", "Search customers by name, email or domain."],
      ["get_subscription", "Read the plan and seats a customer is on."],
      ["list_invoices", "List the invoices of a customer."],
      ["get_invoice", "Read an invoice and its line items."],
      [
        "refund",
        "Issue a refund against a paid invoice, in full or for a partial amount. The refund goes back to the original payment method and cannot be reversed once the processor has accepted it, so the agent has to pass the invoice id, the amount in cents and a reason code that the finance team reads in the monthly reconciliation. Refunds above five thousand euros are rejected and have to go through the finance approval flow instead.",
      ],
      [
        "void_invoice",
        "Void an invoice that has not been paid yet, which removes it from the customer's balance and from the dunning sequence. Voiding is preferred over deleting: the invoice stays on the account for auditing, marked as void with the actor who voided it. An invoice that has already been paid cannot be voided and needs a refund instead.",
      ],
      ["issue_credit_note", "Credit a customer against a future invoice."],
      ["update_billing_address", "Change the address invoices are cut to."],
      ["list_payment_methods", "List the cards and mandates on file."],
      ["delete_payment_method", "Remove a card or mandate from the account."],
      ["send_invoice_email", "Email an invoice to the billing contact."],
      ["get_audit_trail", "Read what changed on an account, and by whom."],
    ],
  },
  {
    id: "tool-runbooks",
    name: "Runbooks",
    description: "A custom MCP server that executes on-call runbooks.",
    icon: Server03,
    account: "",
    serverUrl: "https://runbooks.acme.internal/mcp",
    iconName: "ActionServerIcon",
    operations: [
      ["list_runbooks", "List the runbooks available."],
      ["get_runbook", "Read the steps a runbook would run."],
      [
        "run_runbook",
        "Execute a runbook end to end against the environment it targets, streaming each step's output back as it goes. Steps run in order and the run stops at the first failure, leaving the environment part-way through, so a runbook that restarts services or rotates credentials should only be run by someone who can finish the job by hand if it stops. Every run is recorded with its actor, its arguments and its output.",
      ],
      ["restart_service", "Restart a service in a given environment."],
      ["rotate_credentials", "Rotate the credentials of a service account."],
      ["get_run_log", "Read the output of a past runbook run."],
    ],
  },
];

// An operation that only reads is not worth interrupting anyone over, so the
// seed puts the ones that write behind a question.
function defaultStakeFor(operationName: string): ToolStake {
  if (
    /^(create|update|post|add|transition|refund|void|issue|send|delete|restart|rotate|run_runbook)/.test(
      operationName
    )
  ) {
    return "high";
  }
  if (
    /^(run_query|run_saved_query|run_soql|browse|explain)/.test(operationName)
  ) {
    return "medium";
  }
  return "never_ask";
}

export const mockTools: MockTool[] = TOOL_SEEDS.map((toolSeed) => {
  const seed = toolSeed.id;

  return {
    id: toolSeed.id,
    name: toolSeed.name,
    description: toolSeed.description,
    icon: toolSeed.icon,
    serverUrl: toolSeed.serverUrl ?? null,
    iconName: toolSeed.iconName ?? null,
    isWorkspaceWide: seededRandom(seed, 1) < 0.45,
    spaceIds: seededPick(mockCompanySpaces, seed, 10, 0.35).map(
      (space) => space.id
    ),
    account: toolSeed.account,
    isConnected: toolSeed.isConnected ?? true,
    scopes: toolSeed.scopes ?? [],
    isRestrictedToSkills: seededRandom(seed, 4) < 0.25,
    editorId: seededUserIds(seed, 1)[0],
    updatedAt: seededDaysAgo(seed, 2, 60),
    usedByAgentIds: seededPick(mockAgents, seed, 20, 0.22).map(
      (agent) => agent.id
    ),
    operations: toolSeed.operations.map(([name, description]) => ({
      name,
      description,
      enabled: true,
      stake: defaultStakeFor(name),
    })),
  };
});

export function getToolById(id: string): MockTool | undefined {
  return mockTools.find((tool) => tool.id === id);
}

// ── Skills ───────────────────────────────────────────────────────────────────

/** Who can reach for a skill, from its editors alone to every agent. */
export type SkillAvailability =
  | "editors"
  | "workspace_users"
  | "users_and_agents";

export const SKILL_AVAILABILITY_DISPLAY: Record<
  SkillAvailability,
  { label: string; color: "primary" | "success" | "highlight"; tooltip: string }
> = {
  editors: {
    label: "Editors only",
    color: "primary",
    tooltip: "Only editors can find it via the composer and agent builder",
  },
  workspace_users: {
    label: "Members",
    color: "success",
    tooltip: "All members can find it via the composer and agent builder",
  },
  users_and_agents: {
    label: "Members and agents",
    color: "highlight",
    tooltip: "Available to all members and agents with Discover Skills",
  },
};

export const SKILL_AVAILABILITIES: SkillAvailability[] = [
  "editors",
  "workspace_users",
  "users_and_agents",
];

export type ManagedSkill = {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  availability: SkillAvailability;
  status: "active" | "archived";
  /** Messages over the last 30 days. A Dust skill is always on, so it has none. */
  usageCount: number | null;
  usedByAgentIds: string[];
  editorIds: string[];
  updatedAt: Date;
  /** A Dust-provided skill has no editors and can never be batch-edited. */
  isDustProvided: boolean;
  guidelines: string;
  toolIds: string[];
  spaceIds: string[];
};

type SkillSeed = {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  isDustProvided?: boolean;
};

// The six skills of `podSettings.ts`, plus the ones a workspace builds for
// itself — enough rows for the table to need more than one page.
const SKILL_SEEDS: SkillSeed[] = [
  {
    id: "skill-web-search",
    name: "Web search",
    description: "Search the web for up-to-date information.",
    icon: Globe01,
    isDustProvided: true,
  }, // prettier-ignore
  {
    id: "skill-summarize",
    name: "Summarize",
    description: "Condense long documents into key takeaways.",
    icon: File02,
    isDustProvided: true,
  }, // prettier-ignore
  {
    id: "skill-image",
    name: "Image generation",
    description: "Create images from a text prompt.",
    icon: Image01,
    isDustProvided: true,
  }, // prettier-ignore
  {
    id: "skill-code",
    name: "Code interpreter",
    description: "Run code to analyze data and files.",
    icon: Terminal,
    isDustProvided: true,
  }, // prettier-ignore
  {
    id: "skill-tables",
    name: "Query tables",
    description: "Ask questions over structured tables.",
    icon: Table,
  }, // prettier-ignore
  {
    id: "skill-translate",
    name: "Translate",
    description: "Translate text across languages.",
    icon: Type01,
  }, // prettier-ignore
  {
    id: "skill-deal-review",
    name: "Deal review",
    description:
      "Pull a deal's history and flag what is missing before the call.",
    icon: SalesforceLogo,
  }, // prettier-ignore
  {
    id: "skill-ticket-triage",
    name: "Ticket triage",
    description: "Read a support ticket and route it with a suggested reply.",
    icon: ZendeskLogo,
  }, // prettier-ignore
  {
    id: "skill-pr-review",
    name: "PR review",
    description: "Review a pull request against the team's conventions.",
    icon: GithubLogo,
  }, // prettier-ignore
  {
    id: "skill-sprint-report",
    name: "Sprint report",
    description: "Assemble the sprint summary from Jira and the team's notes.",
    icon: JiraLogo,
  }, // prettier-ignore
  {
    id: "skill-meeting-notes",
    name: "Meeting notes",
    description: "Turn a transcript into decisions, owners and next steps.",
    icon: DocumentPile,
  }, // prettier-ignore
  {
    id: "skill-brand-check",
    name: "Brand check",
    description: "Check a draft against the brand and tone guidelines.",
    icon: MagicWand02,
  }, // prettier-ignore
  {
    id: "skill-schedule",
    name: "Find a slot",
    description: "Find a time that works across several calendars.",
    icon: Calendar,
  }, // prettier-ignore
  {
    id: "skill-config-export",
    name: "Config export",
    description: "Export an agent's configuration as YAML.",
    icon: Brackets,
  }, // prettier-ignore
];

const ARCHIVED_SKILL_SEEDS: SkillSeed[] = [
  {
    id: "skill-archived-legacy-crm",
    name: "Legacy CRM lookup",
    description: "Read records from the CRM we migrated off.",
    icon: CloudArrowLeftRight,
  }, // prettier-ignore
  {
    id: "skill-archived-sheet-append",
    name: "Sheet append",
    description: "Appended rows to the old tracking sheet.",
    icon: GoogleLogo,
  }, // prettier-ignore
];

const SKILL_GUIDELINES = [
  "Use this skill when the request names a specific record. For anything broader, answer from the attached knowledge first.",
  "Never write back to the source system. This skill reads, it does not change anything.",
  "If the lookup returns nothing, say so and stop — do not guess at a close match.",
].join("\n\n");

function decorateSkill(
  skillSeed: SkillSeed,
  overrides: Partial<ManagedSkill> = {}
): ManagedSkill {
  const seed = skillSeed.id;
  const isDustProvided = skillSeed.isDustProvided ?? false;

  return {
    id: skillSeed.id,
    name: skillSeed.name,
    description: skillSeed.description,
    icon: skillSeed.icon,
    availability: isDustProvided
      ? "users_and_agents"
      : SKILL_AVAILABILITIES[Math.floor(seededRandom(seed, 1) * 3)],
    status: "active",
    usageCount: isDustProvided
      ? null
      : Math.floor(seededRandom(seed, 2) * 1800),
    usedByAgentIds: seededPick(mockAgents, seed, 10, 0.25).map(
      (agent) => agent.id
    ),
    editorIds: isDustProvided
      ? []
      : seededUserIds(seed, Math.floor(seededRandom(seed, 3) * 3) + 1),
    updatedAt: seededDaysAgo(seed, 4, 90),
    isDustProvided,
    guidelines: SKILL_GUIDELINES,
    toolIds: seededPick(mockTools, seed, 30, 0.25).map((tool) => tool.id),
    spaceIds: seededPick(mockCompanySpaces, seed, 40, 0.25).map(
      (space) => space.id
    ),
    ...overrides,
  };
}

export const mockManagedSkills: ManagedSkill[] = [
  ...SKILL_SEEDS.map((skillSeed) => decorateSkill(skillSeed)),
  ...ARCHIVED_SKILL_SEEDS.map((skillSeed) =>
    decorateSkill(skillSeed, { status: "archived" })
  ),
];

export function getManagedSkillById(id: string): ManagedSkill | undefined {
  return mockManagedSkills.find((skill) => skill.id === id);
}

/**
 * How many skills reach for a tool, read back from the skills' own tool lists
 * — a tool is used by agents and by skills, and the Tools table counts both.
 */
export function countSkillsUsingTool(toolId: string): number {
  return mockManagedSkills.filter((skill) => skill.toolIds.includes(toolId))
    .length;
}

// ── Agents ───────────────────────────────────────────────────────────────────

/** Who can find an agent, named the way the product's Access column names it. */
export type AgentScope = "visible" | "hidden" | "global";

export type AgentStatus = "active" | "archived";

export const AGENT_SCOPE_INFO: Record<
  AgentScope,
  { label: string; color: "primary" | "success"; tooltip: string }
> = {
  visible: {
    label: "Published",
    color: "success",
    tooltip: "Every member can find this agent.",
  },
  hidden: {
    label: "Not published",
    color: "primary",
    tooltip: "Only its editors can find this agent.",
  },
  global: {
    label: "Default",
    color: "primary",
    tooltip: "A default agent provided by Dust.",
  },
};

export type ManagedAgent = Agent & {
  scope: AgentScope;
  status: AgentStatus;
  modelId: string;
  tags: string[];
  editorIds: string[];
  /** Messages over the last 30 days, which is what the Usage column reports. */
  usageCount: number;
  feedbackUp: number;
  feedbackDown: number;
  updatedAt: Date;
  /** A default agent has no editors, so nobody can edit or select it. */
  canEdit: boolean;
  instructions: string;
  skillIds: string[];
  spaceIds: string[];
};

export const MOCK_AGENT_TAGS = [
  "Engineering",
  "Sales",
  "Support",
  "Marketing",
  "Data",
  "Operations",
  "Legal",
];

export type MockModel = {
  id: string;
  name: string;
  maker: string;
  tier: "Standard" | "Advanced";
};

export const MOCK_MODELS: MockModel[] = [
  {
    id: "claude-4-sonnet",
    name: "Claude 4 Sonnet",
    maker: "Anthropic",
    tier: "Standard",
  }, // prettier-ignore
  {
    id: "claude-4-opus",
    name: "Claude 4 Opus",
    maker: "Anthropic",
    tier: "Advanced",
  }, // prettier-ignore
  { id: "gpt-5", name: "GPT-5", maker: "OpenAI", tier: "Advanced" },
  { id: "gpt-5-mini", name: "GPT-5 mini", maker: "OpenAI", tier: "Standard" },
  {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    maker: "Google",
    tier: "Advanced",
  }, // prettier-ignore
  {
    id: "mistral-large",
    name: "Mistral Large",
    maker: "Mistral",
    tier: "Standard",
  }, // prettier-ignore
];

export function getModelById(id: string): MockModel | undefined {
  return MOCK_MODELS.find((model) => model.id === id);
}

const AGENT_INSTRUCTIONS = [
  "You are a careful assistant. Answer from the knowledge attached to you, and say so plainly when it does not cover the question.",
  "Keep answers short. Lead with the answer, then the reasoning, and never pad a reply to look thorough.",
  "Always cite the document a figure came from, with its title and the section it sits in.",
  "Ask one clarifying question when the request is ambiguous, then proceed without asking again.",
].join("\n\n");

/**
 * The default agents Dust ships. They sit in their own tab, cannot be edited,
 * and so are never selectable.
 */
const GLOBAL_AGENT_SEEDS: Agent[] = [
  {
    id: "agent-global-dust",
    name: "dust",
    emoji: "✨",
    backgroundColor: "bg-primary-100",
    description: "The generalist agent, with access to every workspace tool.",
  },
  {
    id: "agent-global-claude",
    name: "claude",
    emoji: "🧠",
    backgroundColor: "bg-orange-100",
    description: "Anthropic's Claude, with no knowledge attached.",
  },
  {
    id: "agent-global-gpt",
    name: "gpt5",
    emoji: "🤖",
    backgroundColor: "bg-emerald-100",
    description: "OpenAI's GPT-5, with no knowledge attached.",
  },
  {
    id: "agent-global-deepdive",
    name: "deepDive",
    emoji: "🔎",
    backgroundColor: "bg-blue-100",
    description: "Researches a question across the web and reports back.",
  },
];

/** A few agents that have been retired, so the Archived tab is not empty. */
const ARCHIVED_AGENT_SEEDS: Agent[] = [
  {
    id: "agent-archived-1",
    name: "QuarterlyClose",
    emoji: "📕",
    backgroundColor: "bg-gray-200",
    description: "Ran the quarterly close checklist. Replaced by FinanceOps.",
  },
  {
    id: "agent-archived-2",
    name: "OnboardingBuddy",
    emoji: "🎒",
    backgroundColor: "bg-golden-100",
    description: "Walked new joiners through their first week.",
  },
  {
    id: "agent-archived-3",
    name: "LegacyTicketTriage",
    emoji: "🗂️",
    backgroundColor: "bg-slate-200",
    description: "Triaged Zendesk tickets before the Support agent took over.",
  },
];

function decorateAgent(
  agent: Agent,
  overrides: Partial<ManagedAgent> = {}
): ManagedAgent {
  const seed = agent.id;

  return {
    ...agent,
    scope: seededRandom(seed, 2) < 0.65 ? "visible" : "hidden",
    status: "active",
    modelId:
      MOCK_MODELS[Math.floor(seededRandom(seed, 3) * MOCK_MODELS.length)].id, // prettier-ignore
    tags: seededPick(MOCK_AGENT_TAGS, seed, 10, 0.25).slice(0, 2),
    editorIds: seededUserIds(seed, Math.floor(seededRandom(seed, 4) * 4) + 1),
    usageCount: Math.floor(seededRandom(seed, 5) * 4200),
    feedbackUp: Math.floor(seededRandom(seed, 6) * 60),
    feedbackDown: Math.floor(seededRandom(seed, 7) * 9),
    updatedAt: seededDaysAgo(seed, 8, 120),
    canEdit: seededRandom(seed, 9) < 0.8,
    instructions: AGENT_INSTRUCTIONS,
    skillIds: seededPick(mockManagedSkills, seed, 20, 0.3).map(
      (skill) => skill.id
    ),
    spaceIds: seededPick(mockCompanySpaces, seed, 30, 0.3).map(
      (space) => space.id
    ),
    ...overrides,
  };
}

export const mockManagedAgents: ManagedAgent[] = [
  ...mockAgents.map((agent) => decorateAgent(agent)),
  ...GLOBAL_AGENT_SEEDS.map((agent) =>
    decorateAgent(agent, {
      scope: "global",
      canEdit: false,
      editorIds: [],
      tags: [],
      skillIds: [],
      spaceIds: [],
    })
  ),
  ...ARCHIVED_AGENT_SEEDS.map((agent) =>
    decorateAgent(agent, { status: "archived" })
  ),
];

export function getManagedAgentById(id: string): ManagedAgent | undefined {
  return mockManagedAgents.find((agent) => agent.id === id);
}

// ── Signed-in user ───────────────────────────────────────────────────────────

/**
 * Puts the signed-in user among the editors of roughly a third of the rows.
 *
 * The editor lists above are seeded from ids, while the playground draws its
 * signed-in user at random on load — so without this they would never overlap
 * and the "Editable by me" tabs would always read zero.
 */
export function withCurrentUserAsEditor<
  T extends { id: string; editorIds: string[] },
>(items: T[], currentUserId: string, canEdit: (item: T) => boolean): T[] {
  return items.map((item, index) => {
    if (
      !canEdit(item) ||
      index % 3 !== 0 ||
      item.editorIds.includes(currentUserId)
    ) {
      return item;
    }
    return { ...item, editorIds: [currentUserId, ...item.editorIds] };
  });
}

// ── Shared formatting ────────────────────────────────────────────────────────

/**
 * The "Last edited" stamp these tables carry: a date, dropping the year while
 * it is still the current one.
 */
export function formatBuildDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === new Date().getFullYear()
      ? {}
      : { year: "numeric" }),
  });
}

export function formatBuildDateLong(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
