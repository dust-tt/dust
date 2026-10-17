import { BarChart01, Calendar, PresentationChart01 } from "@dust-tt/sparkle";
import { GmailLogo } from "@dust-tt/sparkle/logo/platforms";
import data from "@emoji-mart/data";
import type { EmojiData } from "@sparkle/lib/avatar/types";

import {
  type Agent,
  type Conversation,
  mockAgents,
  mockConversations,
  mockSkills,
  mockSpaces,
  mockUsers,
  type Skill,
  type Space,
  type User,
} from "../data";

// ── Fake session ────────────────────────────────────────────────────────────
// The production page gets these from `useUser` / `useWorkspace`; the
// playground pins one member and one workspace so the prototype is
// deterministic.

export const CURRENT_USER = mockUsers[0];
export const WORKSPACE_NAME = "Acme Corp";

// Production preselects the workspace default agent (`@dust`) in the composer.
// The playground agent set has no such agent, so one is added here; it is
// also listed first in the agent picker.
export const DEFAULT_AGENT: Agent = {
  id: "agent-dust",
  name: "dust",
  emoji: "✨",
  backgroundColor: "bg-violet-100",
  description: "Dust is your general purpose agent.",
};

export const PICKER_AGENTS: Agent[] = [DEFAULT_AGENT, ...mockAgents];

// ── Agent avatars ───────────────────────────────────────────────────────────
// Agents are rendered through the same `/emojis/bg-{color}/{id}/{unified}`
// URL shape Dust serves, which Sparkle's `Avatar` decodes back into an emoji
// on a colored disc.

const emojiData = data as EmojiData;
const pictureUrlByAgentId = new Map<string, string>();

function stripVariationSelectors(emoji: string): string {
  return emoji.replace(/\uFE0F/g, "");
}

export function getAgentPictureUrl(agent: Agent): string {
  const cached = pictureUrlByAgentId.get(agent.id);
  if (cached !== undefined) {
    return cached;
  }

  const wanted = stripVariationSelectors(agent.emoji);
  let url = "";
  for (const emoji of Object.values(emojiData.emojis)) {
    const skin = emoji.skins.find(
      (s) => stripVariationSelectors(s.native) === wanted
    );
    if (skin) {
      const backgroundColor = agent.backgroundColor.replace(/^bg-/, "");
      url = `https://dust.tt/emojis/bg-${backgroundColor}/${emoji.id}/${skin.unified}`;
      break;
    }
  }

  pictureUrlByAgentId.set(agent.id, url);
  return url;
}

export type AvatarBackgroundColor = `bg-${string}`;

// Skills always sit on a light blue tile with a blue glyph, wherever they
// appear; agents keep their own emoji and color.
export const SKILL_TILE_BACKGROUND: AvatarBackgroundColor = "bg-highlight-50";
export const SKILL_TILE_ICON_COLOR = "text-highlight-500";

// ── Agent pictures ──────────────────────────────────────────────────────────
// Some agents carry an uploaded picture instead of an emoji, as in a real
// workspace. Seeded placeholder photos keep them stable across reloads.

const AGENT_PICTURE_SEEDS: Record<string, string> = {
  "agent-12": "strategy-planner",
  "agent-13": "data-analyst",
  "agent-4": "trend-tracker",
  "agent-9": "engagement-pro",
  "agent-16": "research-assistant",
};

export function getAgentImageUrl(agent: Agent): string | undefined {
  const seed = AGENT_PICTURE_SEEDS[agent.id];
  return seed ? `https://picsum.photos/seed/${seed}/256/256` : undefined;
}

// Props for Sparkle's `Avatar`: the picture when the agent has one, otherwise
// its emoji on its color.
export function getAgentAvatarProps(
  agent: Agent
):
  | { visual: string }
  | { emoji: string; backgroundColor: AvatarBackgroundColor } {
  const image = getAgentImageUrl(agent);
  return image
    ? { visual: image }
    : {
        emoji: agent.emoji,
        backgroundColor: asAvatarBackgroundColor(agent.backgroundColor),
      };
}

export function asAvatarBackgroundColor(color: string): AvatarBackgroundColor {
  return (
    color.startsWith("bg-") ? color : `bg-${color}`
  ) as AvatarBackgroundColor;
}

// ── Sidebar: conversations grouped by date ──────────────────────────────────
// Same buckets and ordering as `front/lib/utils/timestamps.ts`.

export const RELATIVE_DATE_BUCKETS = [
  "Today",
  "Yesterday",
  "Last Week",
  "Last Month",
  "Last 12 Months",
  "Older",
] as const;

export type RelativeDateBucket = (typeof RELATIVE_DATE_BUCKETS)[number];

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function shiftDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

function shiftMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  return d;
}

export function groupConversationsByDate(
  conversations: Conversation[],
  now: Date = new Date()
): Record<RelativeDateBucket, Conversation[]> {
  const thresholds: [number, RelativeDateBucket][] = [
    [startOfDay(now).getTime(), "Today"],
    [startOfDay(shiftDays(now, 1)).getTime(), "Yesterday"],
    [startOfDay(shiftDays(now, 7)).getTime(), "Last Week"],
    [startOfDay(shiftMonths(now, 1)).getTime(), "Last Month"],
    [startOfDay(shiftMonths(now, 12)).getTime(), "Last 12 Months"],
  ];

  const groups: Record<RelativeDateBucket, Conversation[]> = {
    Today: [],
    Yesterday: [],
    "Last Week": [],
    "Last Month": [],
    "Last 12 Months": [],
    Older: [],
  };

  const sorted = [...conversations].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );

  for (const conversation of sorted) {
    const time = conversation.updatedAt.getTime();
    const bucket =
      thresholds.find(([threshold]) => time >= threshold)?.[1] ?? "Older";
    groups[bucket].push(conversation);
  }

  return groups;
}

export const SIDEBAR_CONVERSATIONS: Conversation[] = mockConversations;

// ── Sidebar: pods ───────────────────────────────────────────────────────────

export interface PodSummary {
  space: Space;
  unreadCount: number;
  hasActivity: boolean;
}

function toPodSummary(space: Space, index: number): PodSummary {
  // A couple of pods carry unread activity so the section shows the
  // counters / activity dots the production sidebar renders.
  const unreadCount = index === 0 ? 3 : index === 3 ? 1 : 0;
  return {
    space,
    unreadCount,
    hasActivity: unreadCount > 0 || index === 1,
  };
}

export const STARRED_PODS: PodSummary[] = mockSpaces
  .slice(0, 2)
  .map(toPodSummary);

export const PODS: PodSummary[] = mockSpaces.slice(2, 8).map(toPodSummary);

// ── Composer: model picker tiers ────────────────────────────────────────────
// `front/components/model_picker/modelPickerUtils.ts`.

export const MODEL_TIERS = [
  { id: "fast", name: "Basic" },
  { id: "standard", name: "Standard" },
  { id: "complex", name: "Premium" },
] as const;

export type ModelTierId = (typeof MODEL_TIERS)[number]["id"];

// ── Composer: typing suggestions ────────────────────────────────────────────
// While the member types, the composer proposes one agent or skill that would
// improve the answer. Matching is a keyword lookup on the draft; a generic
// fallback keeps the banner visible on longer drafts so the interaction can
// be explored with any text.

export type ComposerSuggestion =
  | { kind: "agent"; agent: Agent; reason: string }
  | { kind: "skill"; skill: Skill; reason: string };

function skillById(id: string): Skill {
  const skill = mockSkills.find((s) => s.id === id);
  if (!skill) {
    throw new Error(`Unknown skill ${id}`);
  }
  return skill;
}

function agentByName(name: string): Agent {
  const agent = mockAgents.find((a) => a.name === name);
  if (!agent) {
    throw new Error(`Unknown agent ${name}`);
  }
  return agent;
}

const SUGGESTION_RULES: { pattern: RegExp; suggestion: ComposerSuggestion }[] =
  [
    {
      pattern: /\b(translat|french|spanish|german|english|language)/i,
      suggestion: {
        kind: "agent",
        agent: agentByName("Translator"),
        reason: "is tuned for translations and keeps tone and terminology.",
      },
    },
    {
      pattern: /\b(data|analy[sz]|chart|table|spreadsheet|csv|metric|number)/i,
      suggestion: {
        kind: "skill",
        skill: skillById("skill-tables"),
        reason: "lets the agent query your tables instead of guessing.",
      },
    },
    {
      pattern: /\b(code|bug|review|pull request|pr\b|typescript|python)/i,
      suggestion: {
        kind: "agent",
        agent: agentByName("CodeReviewer"),
        reason: "reads the code and flags issues with precise references.",
      },
    },
    {
      pattern: /\b(summar|recap|tl;?dr|digest|key points)/i,
      suggestion: {
        kind: "skill",
        skill: skillById("skill-summarize"),
        reason: "condenses long documents into the key takeaways.",
      },
    },
    {
      pattern: /\b(image|picture|visual|illustration|logo|banner)/i,
      suggestion: {
        kind: "skill",
        skill: skillById("skill-image"),
        reason: "generates the visuals directly in the conversation.",
      },
    },
    {
      pattern: /\b(latest|news|today|recent|web|online|search|competitor)/i,
      suggestion: {
        kind: "skill",
        skill: skillById("skill-web-search"),
        reason: "grounds the answer in up-to-date sources from the web.",
      },
    },
    {
      pattern: /\b(plan|strategy|roadmap|okr|goal|quarter)/i,
      suggestion: {
        kind: "agent",
        agent: agentByName("StrategyPlanner"),
        reason: "structures plans and roadmaps with clear milestones.",
      },
    },
  ];

const FALLBACK_SUGGESTION: ComposerSuggestion = {
  kind: "skill",
  skill: skillById("skill-web-search"),
  reason: "grounds the answer in up-to-date sources from the web.",
};

const SUGGESTION_MIN_LENGTH = 12;

// `excludedIds` lists agents and skills already in the query or dismissed for
// this draft, so a second matching rule can surface once the first is applied.
export function getComposerSuggestion(
  draft: string,
  excludedIds: string[] = [],
  // The generic fallback only opens the interaction; once the member has
  // added or dismissed something for this draft, only real matches show.
  allowFallback = true
): ComposerSuggestion | null {
  const text = draft.trim();
  if (text.length === 0) {
    return null;
  }
  const isAvailable = (s: ComposerSuggestion) =>
    !excludedIds.includes(getSuggestionId(s));
  const match = SUGGESTION_RULES.find(
    (rule) => rule.pattern.test(text) && isAvailable(rule.suggestion)
  );
  if (match) {
    return match.suggestion;
  }
  if (
    allowFallback &&
    text.length >= SUGGESTION_MIN_LENGTH &&
    isAvailable(FALLBACK_SUGGESTION)
  ) {
    return FALLBACK_SUGGESTION;
  }
  return null;
}

export function getSuggestionId(suggestion: ComposerSuggestion): string {
  return suggestion.kind === "agent"
    ? suggestion.agent.id
    : suggestion.skill.id;
}

// ── Home: suggested prompts ─────────────────────────────────────────────────
// Starter prompts under the composer. Each carries the skill it needs, so
// picking one fills the draft and attaches the skill in one step. The skills
// are local to the prototype: the shared mock set has no calendar or inbox.

const PROMPT_SKILLS = {
  calendar: {
    id: "skill-calendar",
    name: "Calendar",
    description: "Read your upcoming meetings and their context.",
    icon: Calendar,
  },
  inbox: {
    id: "skill-inbox",
    name: "Inbox",
    description: "Search your messages and threads.",
    // The brand mark keeps its own colors on the blue tile.
    icon: GmailLogo,
  },
  dashboards: {
    id: "skill-dashboards",
    name: "Dashboards",
    description: "Build charts from your team's data.",
    icon: BarChart01,
  },
  slides: {
    id: "skill-slides",
    name: "Slides",
    description: "Draft presentations from company knowledge.",
    icon: PresentationChart01,
  },
} satisfies Record<string, Skill>;

export interface SuggestedPrompt {
  id: string;
  // Short label shown in the list.
  text: string;
  // The fuller request placed in the composer when picked.
  draft: string;
  skill: Skill;
  // Brand marks carry their own colors, so they sit on a neutral tile rather
  // than the blue skill tile.
  iconIsLogo?: boolean;
}

export const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    id: "prompt-meeting",
    text: "Get me ready for my next meeting",
    draft:
      "Get me ready for my next meeting: who is attending, what we discussed last time, open action items on our side, and two or three points I should raise. Keep it to one page.",
    skill: PROMPT_SKILLS.calendar,
  },
  {
    id: "prompt-messages",
    text: "Find important messages I haven't answered",
    draft:
      "Go through my inbox from the last 7 days and list the messages I have not replied to that need an answer from me. Group them by urgency, say who is waiting and since when, and suggest a one-line reply for each.",
    skill: PROMPT_SKILLS.inbox,
    iconIsLogo: true,
  },
  {
    id: "prompt-dashboard",
    text: "Build a dashboard of our team's performance",
    draft:
      "Build a dashboard of our team's performance for this quarter: shipped work per week, cycle time, open bugs by severity, and on-call load. Compare against last quarter and call out the two trends that deserve attention.",
    skill: PROMPT_SKILLS.dashboards,
  },
  {
    id: "prompt-presentation",
    text: "Create a presentation about what our company does",
    draft:
      "Create a 10-slide presentation about what our company does for a new hire's first day: the problem we solve, who our customers are, how the product works, how the teams are organised, and what we are focused on this year. Use our own docs as the source.",
    skill: PROMPT_SKILLS.slides,
  },
];

// ── Discover page ───────────────────────────────────────────────────────────

export const DISCOVER_TABS = ["Discover", "Agents & Skills"] as const;
export type DiscoverTab = (typeof DISCOVER_TABS)[number];

interface DiscoverItemStats {
  authors: User[];
  messageCount: number;
  // Members who used it; a second stat so the meta line reads as usage, not
  // a single number.
  userCount: number;
}

export type DiscoverItem =
  | ({ kind: "agent"; agent: Agent } & DiscoverItemStats)
  | ({ kind: "skill"; skill: Skill } & DiscoverItemStats);

export function getDiscoverItemId(item: DiscoverItem): string {
  return item.kind === "agent" ? item.agent.id : item.skill.id;
}

export function getDiscoverItemName(item: DiscoverItem): string {
  return item.kind === "agent" ? item.agent.name : item.skill.name;
}

export function getDiscoverItemDescription(item: DiscoverItem): string {
  return item.kind === "agent"
    ? item.agent.description
    : item.skill.description;
}

// Handle shown next to the name in lowerCamelCase: agents are mentioned with
// `@`, skills are invoked with `/`.
export function getDiscoverItemHandle(item: DiscoverItem): string {
  const prefix = item.kind === "agent" ? "@" : "/";
  return prefix + getHandle(getDiscoverItemName(item)).slice(1);
}

export function getHandle(name: string): string {
  const words = name.split(/[\s_-]+/).filter(Boolean);
  const camel = words
    .map((w, i) =>
      i === 0
        ? w.charAt(0).toLowerCase() + w.slice(1)
        : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join("");
  return `@${camel}`;
}

export function formatCount(count: number): string {
  return count.toLocaleString("en-US");
}

// "10.2k" style, for the featured cards where the meta line is tight.
export function formatCompactCount(count: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  })
    .format(count)
    .toLowerCase();
}

export function formatAuthors(authors: User[]): string {
  if (authors.length === 0) {
    return "";
  }
  if (authors.length === 1) {
    return authors[0].firstName;
  }
  return `${authors[0].firstName} and ${authors.length - 1} others`;
}

function users(...indices: number[]): User[] {
  return indices.map((i) => mockUsers[i % mockUsers.length]);
}

function agentItem(
  agent: Agent,
  authorIndices: number[],
  messageCount: number
): DiscoverItem {
  return {
    kind: "agent",
    agent,
    authors: users(...authorIndices),
    messageCount,
    userCount: fakeUserCount(messageCount),
  };
}

function skillItem(
  skillId: string,
  authorIndices: number[],
  messageCount: number
): DiscoverItem {
  return {
    kind: "skill",
    skill: skillById(skillId),
    authors: users(...authorIndices),
    messageCount,
    userCount: fakeUserCount(messageCount),
  };
}

// Roughly one active member per 23 messages keeps the two stats plausible
// relative to each other.
function fakeUserCount(messageCount: number): number {
  return Math.round(messageCount / 23);
}

interface DiscoverFeaturedStats {
  author: User;
  messageCount: number;
  userCount: number;
}

export type DiscoverFeatured =
  | ({ kind: "agent"; agent: Agent } & DiscoverFeaturedStats)
  | ({ kind: "skill"; skill: Skill } & DiscoverFeaturedStats);

function featuredAgent(
  agent: Agent,
  author: User,
  messageCount: number
): DiscoverFeatured {
  return {
    kind: "agent",
    agent,
    author,
    messageCount,
    userCount: fakeUserCount(messageCount),
  };
}

function featuredSkill(
  skillId: string,
  author: User,
  messageCount: number
): DiscoverFeatured {
  return {
    kind: "skill",
    skill: skillById(skillId),
    author,
    messageCount,
    userCount: fakeUserCount(messageCount),
  };
}

export const DISCOVER_FEATURED: DiscoverFeatured[] = [
  featuredAgent(agentByName("StrategyPlanner"), mockUsers[3], 12400),
  featuredAgent(DEFAULT_AGENT, mockUsers[3], 9786),
  featuredSkill("skill-web-search", mockUsers[5], 4210),
  featuredAgent(agentByName("CodeReviewer"), mockUsers[8], 1210),
];

export function getFeaturedId(f: DiscoverFeatured): string {
  return f.kind === "agent" ? f.agent.id : f.skill.id;
}

export function getFeaturedName(f: DiscoverFeatured): string {
  return f.kind === "agent" ? f.agent.name : f.skill.name;
}

export const DISCOVER_TRENDING: DiscoverItem[] = [
  agentItem(DEFAULT_AGENT, [4], 9786),
  agentItem(agentByName("StrategyPlanner"), [6, 7, 9, 10, 12, 14], 8111),
  skillItem("skill-tables", [11], 6349),
  agentItem(agentByName("CodeReviewer"), [8, 2], 5120),
];

export const DISCOVER_FOR_YOU: DiscoverItem[] = [
  agentItem(agentByName("DataAnalyst"), [5], 4210),
  skillItem("skill-summarize", [13, 15, 16], 3980),
  agentItem(agentByName("Translator"), [0], 2760),
  skillItem("skill-web-search", [17, 18], 2415),
];

// ── Catalogue (Agents / Skills tabs) ────────────────────────────────────────
// Every agent and skill as a list item, with a side filter of views and
// categories. Stats, categories and ownership are derived deterministically
// from each item's position so the lists are stable across reloads.

export const CATALOG_CATEGORIES = [
  "Analysis",
  "Communication",
  "Community",
  "Competitive Intel",
  "Customer Success",
  "Engineering",
  "FDE",
  "GTM",
  "Hiring",
] as const;
export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number];

export type CatalogView = "favorites" | "popular" | "all" | "mine";

export const CATALOG_VIEWS: { id: CatalogView; label: string }[] = [
  { id: "favorites", label: "Favourites" },
  { id: "popular", label: "Most Popular" },
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
];

export type CatalogKind = "all" | "agent" | "skill";

export const CATALOG_KINDS: { id: CatalogKind; label: string }[] = [
  { id: "all", label: "Agents & Skills" },
  { id: "agent", label: "Agents" },
  { id: "skill", label: "Skills" },
];

function catalogStats(index: number): DiscoverItemStats {
  const authorCount = 1 + (index % 3);
  const authors = Array.from({ length: authorCount }, (_, i) =>
    // Every fourth item is authored by the current member.
    index % 4 === 1 && i === 0
      ? CURRENT_USER
      : mockUsers[(index * 7 + i * 13 + 2) % mockUsers.length]
  );
  // The default agent keeps the count it shows elsewhere on the page.
  const messageCount = index === 0 ? 9786 : 400 + ((index * 731) % 6000);
  return { authors, messageCount, userCount: fakeUserCount(messageCount) };
}

export const ALL_AGENT_ITEMS: DiscoverItem[] = PICKER_AGENTS.map(
  (agent, index) => ({ kind: "agent", agent, ...catalogStats(index) })
);

export const ALL_SKILL_ITEMS: DiscoverItem[] = mockSkills.map(
  (skill, index) => ({ kind: "skill", skill, ...catalogStats(index + 3) })
);

export const ALL_CATALOG_ITEMS: DiscoverItem[] = [
  ...ALL_AGENT_ITEMS,
  ...ALL_SKILL_ITEMS,
];

function catalogIndex(item: DiscoverItem): number {
  const list = item.kind === "agent" ? ALL_AGENT_ITEMS : ALL_SKILL_ITEMS;
  return Math.max(
    0,
    list.findIndex((i) => getDiscoverItemId(i) === getDiscoverItemId(item))
  );
}

export function getCatalogCategory(item: DiscoverItem): CatalogCategory {
  return CATALOG_CATEGORIES[
    (catalogIndex(item) * 5) % CATALOG_CATEGORIES.length
  ];
}

export function isCatalogFavorite(item: DiscoverItem): boolean {
  return catalogIndex(item) % 3 === 0;
}

export function isCatalogMine(item: DiscoverItem): boolean {
  return item.authors.some((a) => a.id === CURRENT_USER.id);
}

export function filterCatalog(
  items: DiscoverItem[],
  view: CatalogView,
  kind: CatalogKind,
  category: CatalogCategory | null
): DiscoverItem[] {
  let result = items.filter(
    (item) =>
      (kind === "all" || item.kind === kind) &&
      (category === null || getCatalogCategory(item) === category)
  );
  switch (view) {
    case "favorites":
      result = result.filter(isCatalogFavorite);
      break;
    case "mine":
      result = result.filter(isCatalogMine);
      break;
    case "popular":
      result = [...result].sort((a, b) => b.messageCount - a.messageCount);
      break;
    case "all":
      break;
  }
  return result;
}
