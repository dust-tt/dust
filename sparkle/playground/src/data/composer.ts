// Mock workspace data for the Composer story. Shapes are trimmed versions of
// front's types (skills, MCP server views, spaces, data source views, content
// nodes, model configurations) — only what the input bar renders.

import {
  AnthropicLogo,
  BarFull,
  BarHalf,
  BarLow,
  Building04,
  CloudArrowLeftRight,
  ConfluenceLogo,
  Cube01,
  DeepseekLogo,
  DriveLogo,
  Folder,
  GeminiLogo,
  GithubLogo,
  Globe01,
  GrokLogo,
  HubspotLogo,
  LinearLogo,
  Lock01,
  MistralLogo,
  MoonshotLogo,
  NotionLogo,
  OpenaiLogo,
  Server03,
  SlackLogo,
  ZaiLogo,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export interface ComposerAgent {
  sId: string;
  name: string;
  // Agents render as emoji avatars; @dust renders the Dust logo.
  emoji: string;
  backgroundColor: string;
  isDust?: boolean;
  description: string;
  // Model the agent runs on; null means the agent uses the "Standard" tier.
  model: { modelId: string; effort: ReasoningEffort } | null;
}

export const COMPOSER_AGENTS: ComposerAgent[] = [
  {
    sId: "dust",
    name: "dust",
    emoji: "",
    backgroundColor: "bg-brand",
    isDust: true,
    description: "An assistant with context on your company data.",
    model: null,
  },
  {
    sId: "analyst",
    name: "Analyst",
    emoji: "📊",
    backgroundColor: "bg-blue-200",
    description: "Answers questions about workspace usage.",
    model: null,
  },
  {
    sId: "claude",
    name: "claude-sonnet",
    emoji: "🤖",
    backgroundColor: "bg-orange-100",
    description: "Anthropic's Claude Sonnet.",
    model: { modelId: "claude-sonnet-5-5", effort: "medium" },
  },
  {
    sId: "deep-dive",
    name: "deep-dive",
    emoji: "🔍",
    backgroundColor: "bg-violet-200",
    description: "Deep research across all your company data.",
    model: { modelId: "claude-opus-5-5", effort: "high" },
  },
  {
    sId: "gpt",
    name: "gpt-6",
    emoji: "✨",
    backgroundColor: "bg-green-200",
    description: "OpenAI's GPT 6.",
    model: { modelId: "gpt-6-sol", effort: "medium" },
  },
  {
    sId: "legal",
    name: "LegalReviewer",
    emoji: "⚖️",
    backgroundColor: "bg-gray-100",
    description: "Reviews contracts against our playbook.",
    model: null,
  },
  {
    sId: "onboarding",
    name: "OnboardingBuddy",
    emoji: "👋",
    backgroundColor: "bg-yellow-200",
    description: "Helps new hires find their way.",
    model: null,
  },
  {
    sId: "sales",
    name: "SalesCopilot",
    emoji: "🚀",
    backgroundColor: "bg-rose-200",
    description: "Prepares account briefs and follow-ups.",
    model: null,
  },
  {
    sId: "support",
    name: "SupportTriage",
    emoji: "🚑",
    backgroundColor: "bg-sky-200",
    description: "Triages incoming support tickets.",
    model: null,
  },
  {
    sId: "translator",
    name: "Translator",
    emoji: "💬",
    backgroundColor: "bg-green-100",
    description: "Translates text between languages.",
    model: null,
  },
];

// ---------------------------------------------------------------------------
// Capabilities (skills + tools)
// ---------------------------------------------------------------------------

export interface ComposerSkill {
  sId: string;
  name: string;
  userFacingDescription: string;
  isDustProvided: boolean;
  isFavorite?: boolean;
}

export const COMPOSER_SKILLS: ComposerSkill[] = [
  {
    sId: "skill-deep-research",
    name: "Deep research",
    userFacingDescription:
      "Plan and run multi-step research across the web and your data",
    isDustProvided: true,
  },
  {
    sId: "skill-frames",
    name: "Create Frames",
    userFacingDescription: "Build interactive dashboards, charts and apps",
    isDustProvided: true,
  },
  {
    sId: "skill-data-viz",
    name: "Data visualization",
    userFacingDescription: "Turn tables and numbers into clear charts",
    isDustProvided: true,
  },
  {
    sId: "skill-discover-knowledge",
    name: "Discover knowledge",
    userFacingDescription: "Browse and search company knowledge",
    isDustProvided: true,
  },
  {
    sId: "skill-brand-voice",
    name: "Brand voice",
    userFacingDescription: "Write in Dust's tone of voice and style guide",
    isDustProvided: false,
    isFavorite: true,
  },
  {
    sId: "skill-release-notes",
    name: "Release notes",
    userFacingDescription: "Draft release notes from merged pull requests",
    isDustProvided: false,
  },
  {
    sId: "skill-account-brief",
    name: "Account brief",
    userFacingDescription: "Summarize an account from CRM, Slack and Gong",
    isDustProvided: false,
  },
  {
    sId: "skill-contract-review",
    name: "Contract review",
    userFacingDescription: "Flag risky clauses against the legal playbook",
    isDustProvided: false,
  },
];

export interface ComposerTool {
  sId: string;
  name: string;
  description: string;
  // Logo shown in the avatar; falls back to a generic tool icon.
  logo?: ComponentType;
  iconName?: string;
}

export const COMPOSER_TOOLS: ComposerTool[] = [
  {
    sId: "tool-web",
    name: "Web search & browse",
    description: "Search the web and read web pages",
    iconName: "globe",
  },
  {
    sId: "tool-image",
    name: "Image generation",
    description: "Generate images from a text prompt",
    iconName: "image",
  },
  {
    sId: "tool-github",
    name: "GitHub",
    description: "Read and act on issues, pull requests and code",
    logo: GithubLogo,
  },
  {
    sId: "tool-hubspot",
    name: "HubSpot",
    description: "Look up and update contacts, companies and deals",
    logo: HubspotLogo,
  },
  {
    sId: "tool-linear",
    name: "Linear",
    description: "Search and create Linear issues",
    logo: LinearLogo,
  },
  {
    sId: "tool-notion",
    name: "Notion",
    description: "Search, read and create Notion pages",
    logo: NotionLogo,
  },
  {
    sId: "tool-slack",
    name: "Slack",
    description: "Search messages and post to channels",
    logo: SlackLogo,
  },
  {
    sId: "tool-table-query",
    name: "Query tables",
    description: "Run SQL over your spreadsheets and databases",
    iconName: "table",
  },
];

// ---------------------------------------------------------------------------
// Knowledge (spaces → categories → data sources → nodes)
// ---------------------------------------------------------------------------

export type SpaceKind = "global" | "regular" | "project";

export interface ComposerSpace {
  sId: string;
  name: string;
  kind: SpaceKind;
  isRestricted: boolean;
}

export const COMPOSER_SPACES: ComposerSpace[] = [
  {
    sId: "space-company",
    name: "Company Data",
    kind: "global",
    isRestricted: false,
  },
  {
    sId: "space-engineering",
    name: "Engineering",
    kind: "regular",
    isRestricted: false,
  },
  { sId: "space-sales", name: "Sales", kind: "regular", isRestricted: false },
  {
    sId: "space-finance",
    name: "Finance",
    kind: "regular",
    isRestricted: true,
  },
  { sId: "space-legal", name: "Legal", kind: "regular", isRestricted: true },
  {
    sId: "pod-q4-launch",
    name: "Q4 launch",
    kind: "project",
    isRestricted: false,
  },
  {
    sId: "pod-hiring",
    name: "Hiring 2026",
    kind: "project",
    isRestricted: true,
  },
];

// front/lib/spaces.ts getSpaceIcon
export function getSpaceIcon(space: ComposerSpace): ComponentType {
  if (space.kind === "project") {
    return space.isRestricted ? Lock01 : Cube01;
  }
  if (space.isRestricted) {
    return Lock01;
  }
  if (space.kind === "global") {
    return Building04;
  }
  return Server03;
}

export type ComposerCategory = "managed" | "folder" | "website";

// front/lib/spaces.ts CATEGORY_DETAILS
export const CATEGORY_DETAILS: Record<
  ComposerCategory,
  { label: string; icon: ComponentType }
> = {
  managed: { label: "Connected Data", icon: CloudArrowLeftRight },
  folder: { label: "Folders", icon: Folder },
  website: { label: "Websites", icon: Globe01 },
};

export interface ComposerDataSource {
  sId: string;
  spaceId: string;
  category: ComposerCategory;
  name: string;
  logo: ComponentType;
  // Folders / websites render a plain icon; connectors a double icon.
  isConnector: boolean;
}

export const COMPOSER_DATA_SOURCES: ComposerDataSource[] = [
  {
    sId: "dsv-notion",
    spaceId: "space-company",
    category: "managed",
    name: "Notion",
    logo: NotionLogo,
    isConnector: true,
  },
  {
    sId: "dsv-drive",
    spaceId: "space-company",
    category: "managed",
    name: "Google Drive",
    logo: DriveLogo,
    isConnector: true,
  },
  {
    sId: "dsv-slack",
    spaceId: "space-company",
    category: "managed",
    name: "Slack",
    logo: SlackLogo,
    isConnector: true,
  },
  {
    sId: "dsv-confluence",
    spaceId: "space-company",
    category: "managed",
    name: "Confluence",
    logo: ConfluenceLogo,
    isConnector: true,
  },
  {
    sId: "dsv-handbook",
    spaceId: "space-company",
    category: "folder",
    name: "Handbook",
    logo: Folder,
    isConnector: false,
  },
  {
    sId: "dsv-docs-site",
    spaceId: "space-company",
    category: "website",
    name: "docs.dust.tt",
    logo: Globe01,
    isConnector: false,
  },
  {
    sId: "dsv-github",
    spaceId: "space-engineering",
    category: "managed",
    name: "GitHub",
    logo: GithubLogo,
    isConnector: true,
  },
  {
    sId: "dsv-eng-notion",
    spaceId: "space-engineering",
    category: "managed",
    name: "Notion",
    logo: NotionLogo,
    isConnector: true,
  },
  {
    sId: "dsv-runbooks",
    spaceId: "space-engineering",
    category: "folder",
    name: "Runbooks",
    logo: Folder,
    isConnector: false,
  },
  {
    sId: "dsv-hubspot",
    spaceId: "space-sales",
    category: "managed",
    name: "HubSpot",
    logo: HubspotLogo,
    isConnector: true,
  },
  {
    sId: "dsv-sales-drive",
    spaceId: "space-sales",
    category: "managed",
    name: "Google Drive",
    logo: DriveLogo,
    isConnector: true,
  },
  {
    sId: "dsv-finance-drive",
    spaceId: "space-finance",
    category: "managed",
    name: "Google Drive",
    logo: DriveLogo,
    isConnector: true,
  },
  {
    sId: "dsv-contracts",
    spaceId: "space-legal",
    category: "folder",
    name: "Contracts",
    logo: Folder,
    isConnector: false,
  },
  {
    sId: "dsv-q4-files",
    spaceId: "pod-q4-launch",
    category: "folder",
    name: "Pod files",
    logo: Folder,
    isConnector: false,
  },
  {
    sId: "dsv-hiring-files",
    spaceId: "pod-hiring",
    category: "folder",
    name: "Pod files",
    logo: Folder,
    isConnector: false,
  },
];

export type ComposerNodeType = "folder" | "document" | "table";

export interface ComposerNode {
  internalId: string;
  dataSourceViewId: string;
  // null at the data source root.
  parentId: string | null;
  title: string;
  type: ComposerNodeType;
  lastUpdatedDaysAgo?: number;
}

// Compact tree literal: [title, type, children?, updatedDaysAgo?]
type NodeSpec = [string, ComposerNodeType, NodeSpec[]?, number?];

const NODE_TREES: Record<string, NodeSpec[]> = {
  "dsv-notion": [
    [
      "Company wiki",
      "folder",
      [
        ["Mission & values", "document", undefined, 41],
        ["Org chart", "document", undefined, 6],
        ["Benefits overview", "document", undefined, 12],
        ["Travel & expense policy", "document", undefined, 30],
      ],
    ],
    [
      "Product",
      "folder",
      [
        ["Roadmap H2 2026", "document", undefined, 3],
        ["Product principles", "document", undefined, 64],
        [
          "PRDs",
          "folder",
          [
            ["PRD — Plan mode", "document", undefined, 2],
            ["PRD — Co-edition", "document", undefined, 9],
            ["PRD — Analytics page", "document", undefined, 17],
          ],
        ],
      ],
    ],
    ["Q3 board deck notes", "document", undefined, 21],
    ["Launch checklist", "document", undefined, 5],
  ],
  "dsv-drive": [
    [
      "Marketing",
      "folder",
      [
        ["Brand guidelines.pdf", "document", undefined, 80],
        ["Q4 campaign brief", "document", undefined, 4],
        ["Webinar calendar", "table", undefined, 1],
      ],
    ],
    [
      "Finance",
      "folder",
      [
        ["FY26 budget", "table", undefined, 14],
        ["Headcount plan", "table", undefined, 8],
      ],
    ],
    ["All-hands — September", "document", undefined, 11],
  ],
  "dsv-slack": [
    ["#general", "document", undefined, 0],
    ["#product", "document", undefined, 0],
    ["#eng-incidents", "document", undefined, 1],
    ["#sales-wins", "document", undefined, 2],
  ],
  "dsv-confluence": [
    [
      "Security",
      "folder",
      [
        ["SOC 2 controls", "document", undefined, 33],
        ["Incident response plan", "document", undefined, 47],
      ],
    ],
    ["Architecture overview", "document", undefined, 26],
  ],
  "dsv-handbook": [
    ["Onboarding guide", "document", undefined, 19],
    ["Remote work policy", "document", undefined, 90],
    ["Code of conduct", "document", undefined, 120],
  ],
  "dsv-docs-site": [
    ["Getting started", "document", undefined, 7],
    [
      "Agents",
      "folder",
      [
        ["Creating an agent", "document", undefined, 7],
        ["Tools and skills", "document", undefined, 7],
      ],
    ],
    ["Connections", "document", undefined, 7],
  ],
  "dsv-github": [
    [
      "dust-tt/dust",
      "folder",
      [
        [
          "Issues",
          "folder",
          [
            ["#18231 Slash menu flickers on Safari", "document", undefined, 1],
            [
              "#18190 Model picker reverts on agent switch",
              "document",
              undefined,
              3,
            ],
          ],
        ],
        [
          "Pull requests",
          "folder",
          [
            ["#18240 feat(composer): / Pick model", "document", undefined, 0],
            [
              "#18212 fix(input-bar): attachments row",
              "document",
              undefined,
              2,
            ],
          ],
        ],
        ["README.md", "document", undefined, 30],
      ],
    ],
    [
      "dust-tt/connectors",
      "folder",
      [["README.md", "document", undefined, 44]],
    ],
  ],
  "dsv-eng-notion": [
    ["Engineering onboarding", "document", undefined, 15],
    ["On-call rotation", "table", undefined, 2],
    [
      "RFCs",
      "folder",
      [
        ["RFC — Workflows v2", "document", undefined, 10],
        ["RFC — Sandbox files", "document", undefined, 24],
      ],
    ],
  ],
  "dsv-runbooks": [
    ["Database failover", "document", undefined, 60],
    ["Rotate API keys", "document", undefined, 35],
  ],
  "dsv-hubspot": [
    [
      "Companies",
      "folder",
      [
        ["Acme Corp", "document", undefined, 1],
        ["Globex", "document", undefined, 6],
        ["Initech", "document", undefined, 13],
      ],
    ],
    ["Pipeline Q4", "table", undefined, 0],
  ],
  "dsv-sales-drive": [
    ["Pitch deck 2026", "document", undefined, 18],
    ["Pricing one-pager", "document", undefined, 9],
    [
      "Battlecards",
      "folder",
      [
        ["Battlecard — Glean", "document", undefined, 12],
        ["Battlecard — Copilot", "document", undefined, 12],
      ],
    ],
  ],
  "dsv-finance-drive": [
    ["Monthly close — August", "table", undefined, 20],
    ["Board pack Q3", "document", undefined, 22],
  ],
  "dsv-contracts": [
    ["MSA template", "document", undefined, 100],
    ["DPA template", "document", undefined, 100],
    ["Acme — order form", "document", undefined, 4],
  ],
  "dsv-q4-files": [
    ["Launch plan", "document", undefined, 1],
    ["Press release draft", "document", undefined, 2],
    ["Launch metrics", "table", undefined, 0],
  ],
  "dsv-hiring-files": [
    ["Hiring plan", "table", undefined, 5],
    ["Interview scorecard", "document", undefined, 31],
  ],
};

function flattenTree(
  dataSourceViewId: string,
  specs: NodeSpec[],
  parentId: string | null,
  out: ComposerNode[]
) {
  for (const [title, type, children, lastUpdatedDaysAgo] of specs) {
    const internalId = `${dataSourceViewId}:${parentId ?? "root"}:${title}`;
    out.push({
      internalId,
      dataSourceViewId,
      parentId,
      title,
      type,
      lastUpdatedDaysAgo,
    });
    if (children) {
      flattenTree(dataSourceViewId, children, internalId, out);
    }
  }
}

export const COMPOSER_NODES: ComposerNode[] = (() => {
  const out: ComposerNode[] = [];
  for (const [dsvId, specs] of Object.entries(NODE_TREES)) {
    flattenTree(dsvId, specs, null, out);
  }
  return out;
})();

export function getNodeChildren(
  dataSourceViewId: string,
  parentId: string | null
): ComposerNode[] {
  return COMPOSER_NODES.filter(
    (n) => n.dataSourceViewId === dataSourceViewId && n.parentId === parentId
  );
}

export function getNodePath(node: ComposerNode): string[] {
  const path: string[] = [];
  let parentId = node.parentId;
  while (parentId) {
    const parent = COMPOSER_NODES.find((n) => n.internalId === parentId);
    if (!parent) {
      break;
    }
    path.unshift(parent.title);
    parentId = parent.parentId;
  }
  return path;
}

// Files already in the conversation / pod, surfaced first by the Attach search.
export interface ComposerContextFile {
  id: string;
  label: string;
  contentType: string;
  path: string;
}

export const COMPOSER_CONTEXT_FILES: ComposerContextFile[] = [
  {
    id: "file-q3-metrics",
    label: "q3_metrics.csv",
    contentType: "text/csv",
    path: "/files/conversation/q3_metrics.csv",
  },
  {
    id: "file-launch-brief",
    label: "launch_brief.pdf",
    contentType: "application/pdf",
    path: "/files/conversation/launch_brief.pdf",
  },
];

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "maximal";

// front/types/assistant/models/reasoning.ts
export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: "None",
  minimal: "Min",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "xHigh",
  maximal: "Max",
};

export type ModelMakerId =
  | "anthropic"
  | "openai"
  | "google_ai_studio"
  | "mistral"
  | "deepseek"
  | "xai"
  | "moonshot"
  | "zai";

export const MODEL_MAKERS: {
  id: ModelMakerId;
  name: string;
  logo: ComponentType;
}[] = [
  { id: "anthropic", name: "Anthropic", logo: AnthropicLogo },
  { id: "openai", name: "OpenAI", logo: OpenaiLogo },
  { id: "google_ai_studio", name: "Google", logo: GeminiLogo },
  { id: "mistral", name: "Mistral", logo: MistralLogo },
  { id: "deepseek", name: "DeepSeek", logo: DeepseekLogo },
  { id: "xai", name: "xAI", logo: GrokLogo },
  { id: "moonshot", name: "Moonshot AI", logo: MoonshotLogo },
  { id: "zai", name: "Z.ai", logo: ZaiLogo },
];

export type ModelsTierName =
  | "cost_efficient"
  | "balanced"
  | "premium"
  | "ultra";

// front/types/assistant/models/model_tiers.ts MODELS_TIER_DISPLAY_NAMES
export const MODELS_TIER_DISPLAY_NAMES: Record<ModelsTierName, string> = {
  cost_efficient: "Basic",
  balanced: "Standard",
  premium: "Premium",
  ultra: "Ultra",
};

export interface ComposerModel {
  modelId: string;
  makerId: ModelMakerId;
  displayName: string;
  // Supported efforts in slider order; empty for non-reasoning models.
  efforts: ReasoningEffort[];
  defaultEffort: ReasoningEffort;
  // Credit tier per effort (drives the tier chip on the selected row).
  tierByEffort: Partial<Record<ReasoningEffort, ModelsTierName>>;
  // Locked on a plan without premium models.
  isLocked?: boolean;
  isDegraded?: boolean;
}

const tiers = (
  efforts: ReasoningEffort[],
  pick: (e: ReasoningEffort) => ModelsTierName
) => Object.fromEntries(efforts.map((e) => [e, pick(e)]));

const OPUS_EFFORTS: ReasoningEffort[] = ["low", "medium", "high", "maximal"];
const SONNET_EFFORTS: ReasoningEffort[] = ["none", "low", "medium", "high"];
const GPT_EFFORTS: ReasoningEffort[] = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];
const GEMINI_EFFORTS: ReasoningEffort[] = ["low", "medium", "high"];

export const COMPOSER_MODELS: ComposerModel[] = [
  {
    modelId: "claude-opus-5-5",
    makerId: "anthropic",
    displayName: "Claude Opus 5.5",
    efforts: OPUS_EFFORTS,
    defaultEffort: "medium",
    tierByEffort: tiers(OPUS_EFFORTS, (e) =>
      e === "maximal" ? "ultra" : "premium"
    ),
  },
  {
    modelId: "claude-fable-5-1",
    makerId: "anthropic",
    displayName: "Claude Fable 5.1",
    efforts: OPUS_EFFORTS,
    defaultEffort: "medium",
    tierByEffort: tiers(OPUS_EFFORTS, () => "ultra"),
  },
  {
    modelId: "claude-sonnet-5-5",
    makerId: "anthropic",
    displayName: "Claude Sonnet 5.5",
    efforts: SONNET_EFFORTS,
    defaultEffort: "medium",
    tierByEffort: tiers(SONNET_EFFORTS, (e) =>
      e === "high" ? "premium" : "balanced"
    ),
  },
  {
    modelId: "claude-4-5-haiku",
    makerId: "anthropic",
    displayName: "Claude 4.5 Haiku",
    efforts: [],
    defaultEffort: "none",
    tierByEffort: { none: "cost_efficient" },
  },
  {
    modelId: "gpt-6-sol",
    makerId: "openai",
    displayName: "GPT 6 Sol",
    efforts: GPT_EFFORTS,
    defaultEffort: "medium",
    tierByEffort: tiers(GPT_EFFORTS, (e) =>
      e === "xhigh" ? "ultra" : e === "high" ? "premium" : "balanced"
    ),
  },
  {
    modelId: "gpt-6-astra",
    makerId: "openai",
    displayName: "GPT 6 Astra",
    efforts: GPT_EFFORTS,
    defaultEffort: "medium",
    tierByEffort: tiers(GPT_EFFORTS, () => "premium"),
    isDegraded: true,
  },
  {
    modelId: "gpt-5-6-terra",
    makerId: "openai",
    displayName: "GPT 5.6 Terra",
    efforts: ["minimal", "low", "medium"],
    defaultEffort: "low",
    tierByEffort: tiers(["minimal", "low", "medium"], () => "cost_efficient"),
  },
  {
    modelId: "gemini-3-pro",
    makerId: "google_ai_studio",
    displayName: "Gemini 3 Pro",
    efforts: GEMINI_EFFORTS,
    defaultEffort: "medium",
    tierByEffort: tiers(GEMINI_EFFORTS, () => "premium"),
  },
  {
    modelId: "gemini-3-8-flash",
    makerId: "google_ai_studio",
    displayName: "Gemini 3.8 Flash",
    efforts: GEMINI_EFFORTS,
    defaultEffort: "low",
    tierByEffort: tiers(GEMINI_EFFORTS, () => "cost_efficient"),
  },
  {
    modelId: "mistral-medium-3-5",
    makerId: "mistral",
    displayName: "Mistral Medium 3.5",
    efforts: [],
    defaultEffort: "none",
    tierByEffort: { none: "balanced" },
  },
  {
    modelId: "mistral-large",
    makerId: "mistral",
    displayName: "Mistral Large",
    efforts: [],
    defaultEffort: "none",
    tierByEffort: { none: "balanced" },
  },
  {
    modelId: "deepseek-v4-pro",
    makerId: "deepseek",
    displayName: "DeepSeek V4 Pro",
    efforts: ["low", "high"],
    defaultEffort: "high",
    tierByEffort: tiers(["low", "high"], () => "balanced"),
  },
  {
    modelId: "grok-5",
    makerId: "xai",
    displayName: "Grok 5",
    efforts: ["low", "high"],
    defaultEffort: "low",
    tierByEffort: tiers(["low", "high"], () => "premium"),
    isLocked: true,
  },
  {
    modelId: "kimi-k3",
    makerId: "moonshot",
    displayName: "Kimi K3",
    efforts: [],
    defaultEffort: "none",
    tierByEffort: { none: "balanced" },
  },
  {
    modelId: "glm-5-3",
    makerId: "zai",
    displayName: "GLM-5.3",
    efforts: ["none", "high"],
    defaultEffort: "high",
    tierByEffort: tiers(["none", "high"], () => "balanced"),
  },
];

export type ModelTierId = "fast" | "standard" | "complex";

// front/components/model_picker/modelPickerUtils.ts MODEL_TIERS + modelPickerIcons
export const MODEL_TIERS: {
  id: ModelTierId;
  name: string;
  icon: ComponentType;
  // What the tier currently resolves to (`getTierResolvedModelLabel`).
  resolvedLabel: string;
}[] = [
  {
    id: "fast",
    name: "Basic",
    icon: BarLow,
    resolvedLabel: "Gemini 3.8 Flash Low",
  },
  {
    id: "standard",
    name: "Standard",
    icon: BarHalf,
    resolvedLabel: "Claude Sonnet 5.5 Medium",
  },
  {
    id: "complex",
    name: "Premium",
    icon: BarFull,
    resolvedLabel: "Claude Opus 5.5 High",
  },
];

export const AUTO_MODELS_HINT =
  "Dust selects a model and automatically switches to another if the " +
  "selected model is unstable.";

export function getModelMaker(makerId: ModelMakerId) {
  return MODEL_MAKERS.find((m) => m.id === makerId)!;
}

export function getComposerModel(modelId: string): ComposerModel | undefined {
  return COMPOSER_MODELS.find((m) => m.modelId === modelId);
}
