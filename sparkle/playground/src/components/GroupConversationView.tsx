import {
  Archive,
  ArrowRight,
  Avatar,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Check,
  CheckDouble,
  Chip,
  ContentMessage,
  ConversationListItem,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSearchbar,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  EmptyCTA,
  EmptyCTAButton,
  File02,
  Icon,
  Input,
  ListGroup,
  ListItemSection,
  MagicWand02,
  MessageChatSquare,
  ReplySection,
  SearchInput,
  SearchInputWithPopover,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SliderToggle,
  Tabs,
  TabsContent,
  Trash01,
  TypingAnimation,
  Upload01,
  Users01,
  XClose,
  Zap,
  ZapOff,
} from "@dust-tt/sparkle";
import { UniversalSearchItem } from "@dust-tt/sparkle/components/UniversalSearchItem";
import { cn } from "@sparkle/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";

import { getAgentById } from "../data/agents";
import {
  getDataSourcesBySpaceId,
  isDataSourceFolder,
  moveDataSource,
} from "../data/dataSources";
import {
  enrichMyPodConversationParticipants,
  isMyPodGroupConversation,
  isMyPodMineConversation,
  isTriggeredConversation,
} from "../data/myPod";
import type {
  Agent,
  Conversation,
  DataSource,
  Space,
  User,
} from "../data/types";
import { getUserById } from "../data/users";
import {
  PodCustomizationSection,
  type PodTabCustomizationItem,
} from "./PodCustomizationSection";
import { EmptyState } from "./EmptyState";
import { DataTable } from "./DataTableDnd";
import { FilePreviewPanel } from "./FilePreviewPanel";
import { FilesBrowser } from "./FilesBrowser";
import { FrameSheetHeader } from "./FrameSheetHeader";
import {
  DATA_SOURCE_FILE_DRAG_MIME,
  DATA_SOURCE_FILE_NAME_DRAG_MIME,
} from "./FreeButtonSwitch";
import { InputBar, type InputBarTaskCommand } from "./InputBar";
import { SuggestionBox } from "./SuggestionBox";
import { TaskItem } from "./TaskItem";
import { TodoInputBar } from "./TodoInputBar";

interface GroupConversationViewProps {
  space: Space;
  conversations: Conversation[];
  users: User[];
  agents: Agent[];
  spaceMemberIds?: string[];
  editorUserIds?: string[];
  onConversationClick?: (conversation: Conversation) => void;
  onInviteMembers?: () => void;
  showToolsAndAboutTabs?: boolean;
  onUpdateSpaceName?: (spaceId: string, newName: string) => void;
  onUpdateSpacePublic?: (spaceId: string, isPublic: boolean) => void;
  spacePublicSettings?: Map<string, boolean>;
  isProjectJoined?: boolean;
  onJoinProject?: () => void;
  onLeaveProject?: () => void;
  selectedConversationId?: string | null;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  dynamicFileTabIds?: string[];
  onAddFileToTopbar?: (fileId: string) => void;
  /** When set, opening a file calls this instead of the built-in sheet. */
  onFileOpen?: (dataSource: DataSource) => void;
  onFileDragChange?: (fileId: string | null, fileName?: string | null) => void;
  fileToRevealInKnowledge?: string | null;
  onFileToRevealInKnowledgeHandled?: () => void;
  podVariant?: "shared" | "personal";
  showComposer?: boolean;
  hideConversationFilters?: boolean;
  currentUserId?: string;
  podTabCustomization?: {
    tabs: PodTabCustomizationItem[];
    addableFiles: DataSource[];
    onReorder: (draggedValue: string, targetValue: string) => void;
    onChangeIcon: (tabValue: string, iconName: string) => void;
    onRemove: (tabValue: string) => void;
    onAdd: (file: DataSource) => void;
  };
}

interface Member {
  userId: string;
  joinedAt: Date;
  onClick?: () => void; // For DataTable compatibility
}

type UniversalSearchItem =
  | {
      type: "document";
      dataSource: DataSource;
      title: string;
      description: string;
      score: number;
    }
  | {
      type: "conversation";
      conversation: Conversation;
      creator?: User;
      title: string;
      description: string;
      score: number;
    };

function getParticipantSeedId(participant: {
  type: "user" | "agent";
  data: User | Agent;
}) {
  return participant.type === "user"
    ? (participant.data as User).id
    : (participant.data as Agent).id;
}

// Helper function to get random participants for a conversation
function getRandomParticipants(
  conversation: Conversation,
  _users: User[],
  _agents: Agent[]
): Array<{ type: "user" | "agent"; data: User | Agent }> {
  const allParticipants: Array<{ type: "user" | "agent"; data: User | Agent }> =
    [];

  // Add user participants
  conversation.userParticipants.forEach((userId) => {
    const user = getUserById(userId);
    if (user) {
      allParticipants.push({ type: "user", data: user });
    }
  });

  // Add agent participants
  conversation.agentParticipants.forEach((agentId) => {
    const agent = getAgentById(agentId);
    if (agent) {
      allParticipants.push({ type: "agent", data: agent });
    }
  });

  // Shuffle and select 1-6 participants deterministically per row.
  const shuffled = [...allParticipants].sort(
    (a, b) =>
      seededRandom(`${conversation.id}-${getParticipantSeedId(a)}`, 0) -
      seededRandom(`${conversation.id}-${getParticipantSeedId(b)}`, 0)
  );
  const count = Math.min(
    Math.max(1, Math.floor(seededRandom(conversation.id, 1) * 6) + 1),
    shuffled.length
  );
  return shuffled.slice(0, count);
}

// Helper function to get random creator from people
function getRandomCreator(
  conversation: Conversation,
  _users: User[]
): User | null {
  if (conversation.userParticipants.length === 0) {
    return null;
  }
  const creatorId =
    conversation.userParticipants[
      Math.floor(
        seededRandom(`${conversation.id}-creator`, 0) *
          conversation.userParticipants.length
      )
    ];
  return getUserById(creatorId) || null;
}

// Convert participants to Avatar props format for Avatar.Stack
function participantsToAvatarProps(
  participants: Array<{ type: "user" | "agent"; data: User | Agent }>
) {
  return participants.map((participant) => {
    if (participant.type === "user") {
      const user = participant.data as User;
      return {
        name: user.fullName,
        visual: user.portrait,
        isRounded: true,
      };
    } else {
      const agent = participant.data as Agent;
      return {
        name: agent.name,
        emoji: agent.emoji,
        backgroundColor: agent.backgroundColor,
        isRounded: false,
      };
    }
  });
}

// Helper function to categorize conversation by date
function getDateBucket(
  updatedAt: Date
): "Today" | "Yesterday" | "Last Week" | "Last Month" {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastMonth = new Date(today);
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  const conversationDate = new Date(
    updatedAt.getFullYear(),
    updatedAt.getMonth(),
    updatedAt.getDate()
  );

  if (conversationDate.getTime() >= today.getTime()) {
    return "Today";
  } else if (conversationDate.getTime() >= yesterday.getTime()) {
    return "Yesterday";
  } else if (conversationDate.getTime() >= lastWeek.getTime()) {
    return "Last Week";
  } else {
    return "Last Month";
  }
}

const GENERATED_CONVERSATION_TITLES = [
  "Scope alignment notes",
  "Budget trade-off review",
  "Launch checklist sync",
  "Customer feedback triage",
  "Milestone planning thread",
  "Design direction review",
  "Open blockers roundup",
  "Rollout readiness check",
  "Data quality investigation",
  "Stakeholder update draft",
  "Implementation plan review",
  "Risk register cleanup",
  "Experiment results debrief",
  "Dependency mapping session",
  "Support handoff notes",
  "Roadmap decision recap",
  "Integration follow-up",
  "QA findings review",
  "Weekly progress pulse",
  "Next steps planning",
];

const GENERATED_CONVERSATION_DESCRIPTION_TEMPLATES = [
  "Project discussion covering {title}, owners, open questions, and the next decisions needed to keep work moving.",
  "Follow-up thread for {title}, including context from recent conversations and proposed action items.",
  "Working notes about {title}, with blockers, assumptions, and coordination details for the project team.",
  "Planning conversation focused on {title}, timelines, dependencies, and expected outcomes.",
  "Review thread for {title}, summarizing what changed, what remains unclear, and who should follow up.",
];

// Helper function to generate more conversations with varied dates
function generateConversationsWithDates(
  conversations: Conversation[],
  count: number,
  seed: string
): Conversation[] {
  const now = new Date();
  const generated: Conversation[] = [];

  // Duplicate and vary existing conversations
  for (let i = 0; i < count; i++) {
    const baseConversation = conversations[i % conversations.length];
    const rowSeed = `${seed}-${baseConversation.id}-${i}`;
    const daysAgo = Math.floor(seededRandom(rowSeed, 0) * 35); // Up to 35 days ago
    const hoursAgo = Math.floor(seededRandom(rowSeed, 1) * 24);
    const minutesAgo = Math.floor(seededRandom(rowSeed, 2) * 60);
    const title =
      GENERATED_CONVERSATION_TITLES[
        Math.floor(
          seededRandom(rowSeed, 3) * GENERATED_CONVERSATION_TITLES.length
        )
      ];
    const descriptionTemplate =
      GENERATED_CONVERSATION_DESCRIPTION_TEMPLATES[
        Math.floor(
          seededRandom(rowSeed, 4) *
            GENERATED_CONVERSATION_DESCRIPTION_TEMPLATES.length
        )
      ];

    const updatedAt = new Date(now);
    updatedAt.setDate(updatedAt.getDate() - daysAgo);
    updatedAt.setHours(updatedAt.getHours() - hoursAgo);
    updatedAt.setMinutes(updatedAt.getMinutes() - minutesAgo);

    const createdAt = new Date(updatedAt);
    createdAt.setDate(
      createdAt.getDate() - Math.floor(seededRandom(rowSeed, 5) * 5)
    );

    generated.push({
      ...baseConversation,
      id: `${baseConversation.id}-${i}`,
      updatedAt,
      createdAt,
      title,
      description: descriptionTemplate.replace("{title}", title.toLowerCase()),
    });
  }

  return generated;
}

// Seeded random function for deterministic randomness
function seededRandom(seed: string, index: number): number {
  const hash = seed
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const x = Math.sin((hash + index) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const FAKE_PROJECT_TODO_ITEMS: ChecklistItem[] = [
  {
    id: "fake-todo-design-copy",
    text: "Tighten the onboarding copy for a sharper first-run flow.",
  },
  {
    id: "fake-todo-risk-log",
    text: "Add the latest mitigation notes to the weekly risk log.",
  },
  {
    id: "fake-todo-customer-brief",
    text: "Prepare the customer brief for the roadmap sync.",
  },
  {
    id: "fake-todo-data-check",
    text: "Validate the dashboard numbers against the source export.",
  },
  {
    id: "fake-todo-launch-owner",
    text: "Document who owns each beta rollout checklist item.",
  },
  {
    id: "fake-todo-budget-follow-up",
    text: "Resolve the budget question before planning closes.",
  },
  {
    id: "fake-todo-doc-update",
    text: "Update the implementation notes with the latest constraints.",
  },
  {
    id: "fake-todo-support-plan",
    text: "Draft the first-week support plan.",
  },
  {
    id: "fake-todo-qa-scope",
    text: "Split the QA scope into smoke tests and regression checks.",
  },
  {
    id: "fake-todo-api-contract",
    text: "Write down the API contract changes for the integrations team.",
  },
  {
    id: "fake-todo-migration-window",
    text: "Propose a migration window that avoids customer peak hours.",
  },
  {
    id: "fake-todo-analytics-event",
    text: "Add the missing analytics event to the release tracker.",
  },
];

const TODO_SUGGESTION_TEXTS = [
  "Summarize the open decisions from the latest project thread.",
  "Prepare the follow-up notes for the next sync.",
  "Update the project tracker with the latest owner and deadline.",
  "Draft the customer-facing summary for review.",
  "Check the release checklist for missing blockers.",
  "Add the latest constraints to the implementation notes.",
  "Validate the current numbers against the source export.",
  "Write the rollout risk notes before the planning review.",
];

const PROJECT_SETUP_TODO_SUGGESTION_TEXTS = [
  "Set up the project description and goals",
  "Bring in knowledge from company data",
  "Search for and add project members",
  "Build a list of initial tasks",
];

const PARTICIPANT_TODO_SUGGESTION_TEXTS = [
  "Turn the latest customer feedback into follow-up tasks.",
  "Add the missing rollout note to the project tracker.",
  "Prepare a short update before the next project sync.",
  "Check whether the open blocker still needs escalation.",
  "Summarize the action items from the last discussion.",
  "Update the implementation note with the latest decision.",
];

const TODO_HISTORY_FILTER_LABELS: Record<TodoHistoryFilter, string> = {
  ongoing: "Open",
  today: "Done today",
  last7: "Done in the last 7 days",
  last30: "Done in the last 30 days",
};

const TODO_HISTORY_FILTER_OPTIONS: TodoHistoryFilter[] = [
  "ongoing",
  "today",
  "last7",
  "last30",
];

const FAKE_CLOSED_PROJECT_TODO_ITEMS: Record<
  TodoHistoryFilter,
  ChecklistItem[]
> = {
  ongoing: [],
  today: [
    {
      id: "closed-today-launch-notes",
      text: "Finalized the launch notes before the morning review.",
    },
    {
      id: "closed-today-budget-answer",
      text: "Resolved the open budget question in the planning doc.",
    },
    {
      id: "closed-today-dashboard-check",
      text: "Checked the dashboard totals against the source export.",
    },
    {
      id: "closed-today-customer-brief",
      text: "Shared the customer brief for the roadmap sync.",
    },
    {
      id: "closed-today-api-thread",
      text: "Wrote the final API contract note for integrations.",
    },
  ],
  last7: [
    {
      id: "closed-last7-onboarding-copy",
      text: "Shipped the onboarding copy update.",
    },
    {
      id: "closed-last7-risk-log",
      text: "Added mitigation notes to the weekly risk log.",
    },
    {
      id: "closed-last7-qa-scope",
      text: "Split QA scope into smoke and regression checks.",
    },
    {
      id: "closed-last7-support-plan",
      text: "Drafted the first-week support plan.",
    },
    {
      id: "closed-last7-migration-window",
      text: "Proposed the preferred migration window.",
    },
    {
      id: "closed-last7-analytics-event",
      text: "Added the missing analytics event to the release tracker.",
    },
    {
      id: "closed-last7-legal-review",
      text: "Completed the legal review follow-up for launch messaging.",
    },
    {
      id: "closed-last7-doc-constraints",
      text: "Updated implementation notes with the latest constraints.",
    },
  ],
  last30: [
    {
      id: "closed-last30-beta-owner",
      text: "Documented the beta rollout owner list.",
    },
    {
      id: "closed-last30-data-cleanup",
      text: "Completed the data cleanup pass for archived projects.",
    },
    {
      id: "closed-last30-sales-enablement",
      text: "Published the sales enablement one-pager.",
    },
    {
      id: "closed-last30-design-review",
      text: "Closed the design review notes from the kickoff.",
    },
    {
      id: "closed-last30-billing-sync",
      text: "Wrote the billing assumptions summary for the finance team.",
    },
    {
      id: "closed-last30-qa-owners",
      text: "Listed the QA owners for the release train.",
    },
    {
      id: "closed-last30-customer-list",
      text: "Cleaned up the early-access customer list.",
    },
    {
      id: "closed-last30-doc-index",
      text: "Organized the project docs index for new contributors.",
    },
    {
      id: "closed-last30-demo-script",
      text: "Recorded the demo script changes requested by support.",
    },
    {
      id: "closed-last30-roadmap-sync",
      text: "Captured the decisions from the monthly roadmap sync.",
    },
    {
      id: "closed-last30-security-check",
      text: "Resolved the security checklist items for the integration.",
    },
    {
      id: "closed-last30-rollout-plan",
      text: "Archived the completed rollout plan follow-ups.",
    },
  ],
};

function getFakeClosedTodoItemsForFilter(
  filter: TodoHistoryFilter
): ChecklistItem[] {
  switch (filter) {
    case "today":
      return FAKE_CLOSED_PROJECT_TODO_ITEMS.today;
    case "last7":
      return [
        ...FAKE_CLOSED_PROJECT_TODO_ITEMS.today,
        ...FAKE_CLOSED_PROJECT_TODO_ITEMS.last7,
      ];
    case "last30":
      return [
        ...FAKE_CLOSED_PROJECT_TODO_ITEMS.today,
        ...FAKE_CLOSED_PROJECT_TODO_ITEMS.last7,
        ...FAKE_CLOSED_PROJECT_TODO_ITEMS.last30,
      ];
    case "ongoing":
      return FAKE_CLOSED_PROJECT_TODO_ITEMS.ongoing;
  }
}

// Generate joinedAt date for a member (deterministic based on space and member ID)
function generateJoinedAt(spaceId: string, memberId: string): Date {
  const now = new Date();
  // Combine spaceId and memberId for seed
  const seed = `${spaceId}-${memberId}`;
  const random = seededRandom(seed, 0);

  // Joined between 365 days ago and now
  const daysAgo = Math.floor(random * 365);
  const joinedAt = new Date(now);
  joinedAt.setDate(joinedAt.getDate() - daysAgo);
  joinedAt.setHours(
    Math.floor(random * 24),
    Math.floor(seededRandom(seed, 1) * 60),
    0,
    0
  );

  return joinedAt;
}

const fakeDocumentFirstLines = [
  "Introduction: This document outlines the initial scope and goals.",
  "Summary: Key findings are consolidated in the sections below.",
  "Overview: A first pass at the requirements and assumptions.",
  "Draft note: Please review the proposed changes and provide feedback.",
  "Excerpt: The following section captures the primary constraints.",
  "Context: This file compiles the core decisions made so far.",
  "Opening: A quick recap of the current state and next steps.",
  "First line: The document begins with a brief background statement.",
];

function getFakeDocumentFirstLine(dataSource: DataSource): string {
  const seed = `${dataSource.id}-${dataSource.fileName}`;
  const index = Math.floor(
    seededRandom(seed, 2) * fakeDocumentFirstLines.length
  );
  return (
    fakeDocumentFirstLines[index] ||
    "Overview: This document contains a summary of the content."
  );
}

function getBaseConversationId(
  conversation: Conversation,
  allConversations: Conversation[]
): string {
  const expandedIdMatch = conversation.id.match(/^(.+)-(\d+)$/);
  if (expandedIdMatch) {
    const potentialBase = expandedIdMatch[1];
    const baseExists = allConversations.some((c) => c.id === potentialBase);
    if (baseExists) {
      return potentialBase;
    }
  }
  return conversation.id;
}

type OngoingSummaryCategory = "needAttention" | "keyDecisions" | "projectPulse";

type SummaryItemDiffState = "unchanged" | "modified" | "added" | "removed";

interface ChecklistItem {
  id: string;
  text: string;
}

type ProjectPulseSegment =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "link";
      text: string;
    };

interface ProjectPulseItem {
  id: string;
  segments: ProjectPulseSegment[];
}

interface OngoingSummary {
  needAttention: ChecklistItem[];
  keyDecisions: ChecklistItem[];
  projectPulse: ProjectPulseItem[];
  updatedAt: Date;
}

interface ParticipantTodoList {
  user: User;
  items: ChecklistItem[];
}

type TodoHistoryFilter = "ongoing" | "today" | "last7" | "last30";
type TodoSuggestionStatus = "idle" | "working" | "ready";

interface TodoSuggestionItem {
  id: string;
  userId: string;
  text: string;
}

type SummaryRelatedConversations = Record<string, string[]>;
type SummaryItemDiffByKey = Record<string, SummaryItemDiffState>;
type AutoCheckRationaleByKey = Record<string, string>;
const SUMMARY_ITEM_TRANSITION_MS = 240;

interface WhatsNewScenario {
  before: OngoingSummary;
  after: OngoingSummary;
  autoCheckedItemIds: string[];
}

const SUMMARY_PEOPLE_NAMES = [
  "Raphael",
  "Seb",
  "Nina",
  "Alex",
  "Maya",
  "Tom",
  "Lea",
  "Jordan",
  "Priya",
  "Sam",
];

function renderSummaryItemWithEmphasizedNames(item: string): ReactNode {
  const namePattern = SUMMARY_PEOPLE_NAMES.join("|");
  const regex = new RegExp(`\\b(${namePattern})\\b`, "g");

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match = regex.exec(item);

  while (match) {
    const matchedName = match[0];
    const matchIndex = match.index;

    if (matchIndex > cursor) {
      nodes.push(item.slice(cursor, matchIndex));
    }

    nodes.push(
      <span key={`${matchedName}-${matchIndex}`} className="font-semibold">
        {matchedName}
      </span>
    );

    cursor = matchIndex + matchedName.length;
    match = regex.exec(item);
  }

  if (cursor < item.length) {
    nodes.push(item.slice(cursor));
  }

  return <>{nodes.length > 0 ? nodes : item}</>;
}

function getSummaryItemIdentity(
  item: ChecklistItem | ProjectPulseItem
): string {
  return item.id;
}

function getSummaryItemKey(
  category: OngoingSummaryCategory,
  item: ChecklistItem | ProjectPulseItem
): string {
  return `${category}::${getSummaryItemIdentity(item)}`;
}

function getSummaryItemKeys(summary: OngoingSummary): string[] {
  return [
    ...summary.needAttention.map((item) =>
      getSummaryItemKey("needAttention", item)
    ),
    ...summary.keyDecisions.map((item) =>
      getSummaryItemKey("keyDecisions", item)
    ),
    ...summary.projectPulse.map((item) =>
      getSummaryItemKey("projectPulse", item)
    ),
  ];
}

function getConversationRowDomId(conversationId: string): string {
  return `conversation-row-${conversationId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function buildRandomSummaryRelatedConversations(
  summary: OngoingSummary,
  conversations: Conversation[]
): SummaryRelatedConversations {
  const availableConversationIds = conversations.map(
    (conversation) => conversation.id
  );
  const links: SummaryRelatedConversations = {};

  if (availableConversationIds.length === 0) {
    return links;
  }

  const summarySections: Array<{
    category: OngoingSummaryCategory;
    items: Array<ChecklistItem | ProjectPulseItem>;
  }> = [
    { category: "needAttention", items: summary.needAttention },
    { category: "keyDecisions", items: summary.keyDecisions },
    { category: "projectPulse", items: summary.projectPulse },
  ];

  summarySections.forEach(({ category, items }) => {
    items.forEach((item) => {
      const projectPulseItem =
        category === "projectPulse" ? (item as ProjectPulseItem) : null;
      const linkSegmentCount =
        projectPulseItem === null
          ? 0
          : projectPulseItem.segments.filter(
              (segment) => segment.type === "link"
            ).length;
      const desiredCount =
        category === "projectPulse"
          ? Math.max(1, linkSegmentCount)
          : availableConversationIds.length > 1 && Math.random() < 0.5
            ? 2
            : 1;
      const shuffledIds = [...availableConversationIds].sort(
        () => Math.random() - 0.5
      );
      links[getSummaryItemKey(category, item)] = shuffledIds.slice(
        0,
        Math.min(desiredCount, shuffledIds.length)
      );
    });
  });

  return links;
}

function buildAutoCheckRationale(
  itemText: string,
  relatedConversationTitles: string[]
): string {
  const lowerText = itemText.toLowerCase();
  let reason = "Item resolved in the thread";

  if (lowerText.includes("question")) {
    reason = "Question answered in the thread";
  } else if (
    lowerText.includes("sign-off") ||
    lowerText.includes("signoff") ||
    lowerText.includes("approval") ||
    lowerText.includes("approve")
  ) {
    reason = "Approval confirmed in the thread";
  } else if (lowerText.includes("budget")) {
    reason = "Budget point clarified in the thread";
  } else if (lowerText.includes("owner") || lowerText.includes("dri")) {
    reason = "Ownership clarified in the thread";
  }

  if (relatedConversationTitles.length === 0) {
    return `${reason}.`;
  }

  const [primaryTitle, ...relatedTitles] = relatedConversationTitles;
  if (relatedTitles.length === 0) {
    return `${reason} in ${primaryTitle}.`;
  }

  return `${reason} in ${primaryTitle}. Related: ${relatedTitles.join(", ")}.`;
}

function getSummaryTimestamp(spaceId: string): Date {
  const minutesAgo =
    Math.floor(seededRandom(`${spaceId}-summary-ts`, 0) * 120) + 15;
  return new Date(Date.now() - minutesAgo * 60 * 1000);
}

function getConversationHighlights(conversations: Conversation[]): string[] {
  const uniqueTitles = new Set<string>();
  const sorted = [...conversations].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );

  for (const conversation of sorted) {
    const title = conversation.title.trim();
    if (title) {
      uniqueTitles.add(title);
    }
    if (uniqueTitles.size >= 6) {
      break;
    }
  }

  return Array.from(uniqueTitles);
}

function buildWhatsNewScenario(
  spaceName: string,
  conversations: Conversation[]
): WhatsNewScenario {
  const highlights = getConversationHighlights(conversations);
  const topHighlight = highlights[0] ?? "current project threads";
  const secondHighlight = highlights[1] ?? "cross-team follow-up";
  const thirdHighlight = highlights[2] ?? "delivery planning";

  return {
    before: {
      needAttention: [
        {
          id: "todo-signoff",
          text: `Raphael is asking for your sign-off on "${topHighlight}" before end of day.`,
        },
        {
          id: "todo-legal-owner",
          text: `Seb asked you to confirm who owns legal follow-up on "${secondHighlight}".`,
        },
        {
          id: "todo-budget-check",
          text: `Nina mentioned you directly to validate budget impact linked to "${thirdHighlight}".`,
        },
      ],
      keyDecisions: [
        {
          id: "decision-scope",
          text: `Raphael and Priya aligned on keeping "${topHighlight}" in the current milestone without scope increase.`,
        },
        {
          id: "decision-rollout",
          text: `Seb and Jordan agreed to pass "${secondHighlight}" through the enterprise rollout checklist.`,
        },
        {
          id: "decision-dri",
          text: `Maya confirmed a single DRI will own "${thirdHighlight}" to reduce coordination delays.`,
        },
      ],
      projectPulse: [
        {
          id: "pulse-weekly-recap",
          segments: [
            { type: "text", text: "The team used " },
            { type: "link", text: "the weekly recap thread" },
            {
              type: "text",
              text: ` to align priorities in ${spaceName} and reduce duplicate updates.`,
            },
          ],
        },
        {
          id: "pulse-risk-alignment",
          segments: [
            { type: "text", text: "Risk mitigation details from " },
            { type: "link", text: `"${topHighlight}"` },
            { type: "text", text: " are now referenced in " },
            { type: "link", text: "the rollout checklist discussion" },
            { type: "text", text: "." },
          ],
        },
        {
          id: "pulse-stakeholder-sync",
          segments: [
            { type: "text", text: "Stakeholder feedback in " },
            { type: "link", text: `"${secondHighlight}"` },
            {
              type: "text",
              text: " shows stronger confidence after the latest sync update.",
            },
          ],
        },
      ],
      updatedAt: getSummaryTimestamp(spaceName),
    },
    after: {
      needAttention: [
        {
          id: "todo-signoff",
          text: `Raphael is asking for your final sign-off on "${topHighlight}" before end of day.`,
        },
        {
          id: "todo-budget-check",
          text: `Nina mentioned you directly to validate budget impact linked to "${thirdHighlight}".`,
        },
        {
          id: "todo-customer-brief",
          text: `Maya is waiting for your approval before sharing the customer-facing update.`,
        },
      ],
      keyDecisions: [
        {
          id: "decision-scope",
          text: `Raphael and Priya aligned on keeping "${topHighlight}" in the current milestone without scope increase.`,
        },
        {
          id: "decision-dri",
          text: `Maya confirmed a single DRI will own "${thirdHighlight}" to reduce coordination delays.`,
        },
        {
          id: "decision-reliability",
          text: `Alex and Tom agreed to prioritize reliability work over net-new scope this cycle.`,
        },
      ],
      projectPulse: [
        {
          id: "pulse-weekly-recap",
          segments: [
            { type: "text", text: "The team used " },
            { type: "link", text: "the weekly recap thread" },
            {
              type: "text",
              text: ` to align priorities in ${spaceName} and reduce duplicate updates.`,
            },
          ],
        },
        {
          id: "pulse-risk-alignment",
          segments: [
            { type: "text", text: "Risk mitigation details from " },
            { type: "link", text: `"${topHighlight}"` },
            { type: "text", text: " are now tracked in " },
            { type: "link", text: "the weekly risks summary" },
            { type: "text", text: " for clearer owner follow-through." },
          ],
        },
        {
          id: "pulse-ownership-clarity",
          segments: [
            { type: "text", text: "Ownership became clearer after " },
            { type: "link", text: "the DRI handoff discussion" },
            { type: "text", text: ", with explicit next steps captured in " },
            { type: "link", text: "the action-items thread" },
            { type: "text", text: "." },
          ],
        },
      ],
      updatedAt: new Date(),
    },
    autoCheckedItemIds: ["todo-budget-check", "decision-dri"],
  };
}

function areProjectPulseItemsEqual(
  previousItem: ProjectPulseItem,
  nextItem: ProjectPulseItem
): boolean {
  if (previousItem.segments.length !== nextItem.segments.length) {
    return false;
  }

  return previousItem.segments.every((segment, index) => {
    const nextSegment = nextItem.segments[index];
    return (
      segment.type === nextSegment.type && segment.text === nextSegment.text
    );
  });
}

function mergeChecklistKeepingRemoved(
  previousItems: ChecklistItem[],
  nextItems: ChecklistItem[]
): ChecklistItem[] {
  const nextItemById = new Map(nextItems.map((item) => [item.id, item]));
  const previousItemIds = new Set(previousItems.map((item) => item.id));

  const merged: ChecklistItem[] = previousItems.map(
    (item) => nextItemById.get(item.id) ?? item
  );

  nextItems.forEach((item) => {
    if (!previousItemIds.has(item.id)) {
      merged.push(item);
    }
  });

  return merged;
}

function buildSummaryWithTemporaryRemovedChecklistItems(
  previousSummary: OngoingSummary,
  nextSummary: OngoingSummary
): OngoingSummary {
  return {
    ...nextSummary,
    needAttention: mergeChecklistKeepingRemoved(
      previousSummary.needAttention,
      nextSummary.needAttention
    ),
    keyDecisions: mergeChecklistKeepingRemoved(
      previousSummary.keyDecisions,
      nextSummary.keyDecisions
    ),
  };
}

function getChecklistRemovedItemKeys(
  previousSummary: OngoingSummary,
  nextSummary: OngoingSummary
): string[] {
  const removedKeys: string[] = [];

  const previousNeedAttentionIds = new Set(
    previousSummary.needAttention.map((item) => item.id)
  );
  const nextNeedAttentionIds = new Set(
    nextSummary.needAttention.map((item) => item.id)
  );
  previousNeedAttentionIds.forEach((itemId) => {
    if (!nextNeedAttentionIds.has(itemId)) {
      removedKeys.push(`needAttention::${itemId}`);
    }
  });

  const previousKeyDecisionIds = new Set(
    previousSummary.keyDecisions.map((item) => item.id)
  );
  const nextKeyDecisionIds = new Set(
    nextSummary.keyDecisions.map((item) => item.id)
  );
  previousKeyDecisionIds.forEach((itemId) => {
    if (!nextKeyDecisionIds.has(itemId)) {
      removedKeys.push(`keyDecisions::${itemId}`);
    }
  });

  return removedKeys;
}

function computeSummaryDiffByKey(
  previousSummary: OngoingSummary,
  nextSummary: OngoingSummary
): SummaryItemDiffByKey {
  const diffs: SummaryItemDiffByKey = {};

  const fillChecklistDiff = (
    category: "needAttention" | "keyDecisions",
    previousItems: ChecklistItem[],
    nextItems: ChecklistItem[]
  ) => {
    const previousById = new Map(previousItems.map((item) => [item.id, item]));
    const nextById = new Map(nextItems.map((item) => [item.id, item]));

    previousById.forEach((previousItem, itemId) => {
      const nextItem = nextById.get(itemId);
      const key = `${category}::${itemId}`;
      if (!nextItem) {
        diffs[key] = "removed";
        return;
      }
      diffs[key] =
        previousItem.text === nextItem.text ? "unchanged" : "modified";
    });

    nextById.forEach((_nextItem, itemId) => {
      const key = `${category}::${itemId}`;
      if (!previousById.has(itemId)) {
        diffs[key] = "added";
      }
    });
  };

  fillChecklistDiff(
    "needAttention",
    previousSummary.needAttention,
    nextSummary.needAttention
  );
  fillChecklistDiff(
    "keyDecisions",
    previousSummary.keyDecisions,
    nextSummary.keyDecisions
  );

  const previousPulseById = new Map(
    previousSummary.projectPulse.map((item) => [item.id, item])
  );
  const nextPulseById = new Map(
    nextSummary.projectPulse.map((item) => [item.id, item])
  );

  previousPulseById.forEach((previousItem, itemId) => {
    const nextItem = nextPulseById.get(itemId);
    const key = `projectPulse::${itemId}`;
    if (!nextItem) {
      diffs[key] = "removed";
      return;
    }
    diffs[key] = areProjectPulseItemsEqual(previousItem, nextItem)
      ? "unchanged"
      : "modified";
  });

  nextPulseById.forEach((_nextItem, itemId) => {
    const key = `projectPulse::${itemId}`;
    if (!previousPulseById.has(itemId)) {
      diffs[key] = "added";
    }
  });

  return diffs;
}

function GroupConversationTabContent({
  value,
  contentClassName,
  fullBleed = false,
  topBox,
  children,
}: {
  value: string;
  contentClassName?: string;
  fullBleed?: boolean;
  topBox?: ReactNode;
  children: ReactNode;
}) {
  // When `topBox` is provided, mirror the NewConversation layout: a tall top
  // region holding the header + input, with the rest of the content scrolling
  // below as the whole page scrolls.
  if (topBox) {
    return (
      <TabsContent value={value}>
        <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-4">
          <div
            className={cn(
              "mx-auto flex w-full max-w-4xl flex-col gap-3 py-8",
              contentClassName
            )}
          >
            {topBox}
            {children}
          </div>
        </div>
      </TabsContent>
    );
  }

  return (
    <TabsContent value={value}>
      <div
        className={cn(
          "flex h-full min-h-0 flex-1 flex-col overflow-y-auto",
          !fullBleed && "px-4"
        )}
      >
        <div
          className={cn(
            "mx-auto flex h-full w-full flex-col",
            fullBleed ? "min-h-0" : "max-w-4xl gap-3 py-6",
            contentClassName
          )}
        >
          {children}
        </div>
      </div>
    </TabsContent>
  );
}

function ProjectSetupEmptyState({
  onSetupProject,
}: {
  onSetupProject: () => void;
}) {
  return (
    <EmptyState
      title="It's quiet in here."
      description="Your Pod is ready but empty! Let us help you invite people, add key data, and more."
      action={
        <Button
          label="Let's go"
          icon={MagicWand02}
          size="md"
          variant="highlight"
          onClick={onSetupProject}
          isPulsing
        />
      }
    />
  );
}

export function GroupConversationView({
  space,
  conversations,
  users,
  agents,
  spaceMemberIds = [],
  editorUserIds = [],
  onConversationClick,
  onInviteMembers,
  showToolsAndAboutTabs = false,
  onUpdateSpaceName,
  onUpdateSpacePublic,
  spacePublicSettings,
  isProjectJoined = false,
  onJoinProject = () => {},
  onLeaveProject = () => {},
  selectedConversationId,
  activeTab: controlledActiveTab,
  onTabChange,
  dynamicFileTabIds = [],
  onAddFileToTopbar,
  onFileOpen,
  onFileDragChange,
  fileToRevealInKnowledge = null,
  onFileToRevealInKnowledgeHandled,
  podVariant = "shared",
  showComposer = true,
  hideConversationFilters = false,
  currentUserId,
  podTabCustomization,
}: GroupConversationViewProps) {
  const [searchText, setSearchText] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [hideTriggeredConversations, setHideTriggeredConversations] =
    useState(false);
  const [selectedConversationRow, setSelectedConversationRow] = useState<{
    rowId: string;
    conversationId: string;
  } | null>(null);
  const [goodToKnowFilter, setGoodToKnowFilter] = useState<
    "all" | "shared" | "mine"
  >("all");
  const [todoSearchText, setTodoSearchText] = useState("");
  const [todoReassignSearchText, setTodoReassignSearchText] = useState("");
  const [todoSuggestionStatus, setTodoSuggestionStatus] =
    useState<TodoSuggestionStatus>("idle");
  const [todoSuggestions, setTodoSuggestions] = useState<TodoSuggestionItem[]>(
    []
  );
  const [todoSuggestionTextById, setTodoSuggestionTextById] = useState<
    Record<string, string>
  >({});
  const [
    participantTodoSuggestionsByUserId,
    setParticipantTodoSuggestionsByUserId,
  ] = useState<Record<string, TodoSuggestionItem[]>>({});
  const [
    participantTodoSuggestionTextById,
    setParticipantTodoSuggestionTextById,
  ] = useState<Record<string, string>>({});
  const [todoItemTextByKey, setTodoItemTextByKey] = useState<
    Record<string, string>
  >({});
  const [todoDraftItemsByUserId, setTodoDraftItemsByUserId] = useState<
    Record<string, ChecklistItem[]>
  >({});
  const [editingTodoItemKey, setEditingTodoItemKey] = useState<string | null>(
    null
  );
  const [deletedTodoItemKeys, setDeletedTodoItemKeys] = useState<Set<string>>(
    new Set()
  );
  const [todoScopeFilter, setTodoScopeFilter] = useState<"all" | "mine">("all");
  const [todoHistoryFilter, setTodoHistoryFilter] =
    useState<TodoHistoryFilter>("ongoing");
  const [hiddenFakeTodoItemKeys, setHiddenFakeTodoItemKeys] = useState<
    Set<string>
  >(new Set());
  const [activeTaskCommand, setActiveTaskCommand] =
    useState<InputBarTaskCommand | null>(null);
  const [ongoingSummary, setOngoingSummary] = useState<OngoingSummary | null>(
    null
  );
  const [isSummaryUpdating, setIsSummaryUpdating] = useState(false);
  const [checkedSummaryItems, setCheckedSummaryItems] = useState<
    Record<string, boolean>
  >({});
  const [summaryRelatedConversations, setSummaryRelatedConversations] =
    useState<SummaryRelatedConversations>({});
  const [summaryItemDiffByKey, setSummaryItemDiffByKey] =
    useState<SummaryItemDiffByKey>({});
  const [autoCheckRationaleByKey, setAutoCheckRationaleByKey] =
    useState<AutoCheckRationaleByKey>({});
  const [typingItemKeys, setTypingItemKeys] = useState<Set<string>>(new Set());
  const [enteringItemKeys, setEnteringItemKeys] = useState<Set<string>>(
    new Set()
  );
  const [exitingItemKeys, setExitingItemKeys] = useState<Set<string>>(
    new Set()
  );
  const [typingVersion, setTypingVersion] = useState(0);
  const deltaTransitionTimeoutRef = useRef<number | null>(null);
  const deltaTransitionStartTimeoutRef = useRef<number | null>(null);
  const cleanTransitionTimeoutRef = useRef<number | null>(null);
  const autoCleanTimeoutRef = useRef<number | null>(null);
  const todoSuggestionTimeoutRef = useRef<number | null>(null);
  const todoSuggestionCounterRef = useRef(0);
  const hasSeededParticipantTodoSuggestionsRef = useRef(false);
  const todoDraftItemCounterRef = useRef(0);
  const pendingFocusTodoItemKeyRef = useRef<string | null>(null);
  const todoItemEditorRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Settings state
  const [roomName, setRoomName] = useState(space.name);
  const [isEditingName, setIsEditingName] = useState(false);
  const [roomDescription, setRoomDescription] = useState(
    space.description ?? ""
  );
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editorIds, setEditorIds] = useState<string[]>(editorUserIds);
  const [isPublic, setIsPublic] = useState(
    spacePublicSettings?.get(space.id) ?? space.isPublic ?? true
  );
  const [showNameSaveDialog, setShowNameSaveDialog] = useState(false);
  const [showPublicToggleDialog, setShowPublicToggleDialog] = useState(false);
  const [pendingPublicValue, setPendingPublicValue] = useState<boolean | null>(
    null
  );

  const [isProjectArchived, setIsProjectArchived] = useState(false);
  const [archivedAt, setArchivedAt] = useState<Date | null>(null);
  const [archivedByName, setArchivedByName] = useState<string | null>(null);
  const [showDeleteProjectDialog, setShowDeleteProjectDialog] = useState(false);
  const [deleteConfirmDraft, setDeleteConfirmDraft] = useState("");

  // Active tab — controlled externally if activeTab/onTabChange props are provided
  const [internalActiveTab, setInternalActiveTab] = useState("conversations");
  const activeTab = controlledActiveTab ?? internalActiveTab;
  const setActiveTab = useCallback(
    (tab: string) => {
      setInternalActiveTab(tab);
      onTabChange?.(tab);
    },
    [onTabChange]
  );

  // Files tab state
  const [dataSources, setDataSources] = useState<DataSource[]>(() =>
    getDataSourcesBySpaceId(space.id)
  );
  const [knowledgeSearchText, setKnowledgeSearchText] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [revealedFileIdInKnowledge, setRevealedFileIdInKnowledge] = useState<
    string | null
  >(null);
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
  const [dropHoverTargetId, setDropHoverTargetId] = useState<string | null>(
    null
  );
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSource | null>(null);
  const [isDocumentSheetOpen, setIsDocumentSheetOpen] = useState(false);
  const [isFrameFullscreen, setIsFrameFullscreen] = useState(false);
  const [pinnedBannerFileId, setPinnedBannerFileId] = useState<string | null>(
    null
  );

  // Members tab state
  const [membersSearchText, setMembersSearchText] = useState("");
  const [selectedMember, setSelectedMember] = useState<User | null>(null);
  const [isMemberSheetOpen, setIsMemberSheetOpen] = useState(false);
  const [removeMemberDialogOpen, setRemoveMemberDialogOpen] = useState(false);
  const [selectedMemberIdToRemove, setSelectedMemberIdToRemove] = useState<
    string | null
  >(null);
  const [conversationIdToShowFocus, setConversationIdToShowFocus] = useState<
    string | null
  >(null);
  const showFocusTimeoutRef = useRef<number | null>(null);

  // Generate more conversations with varied dates
  const expandedConversations = useMemo(() => {
    if (conversations.length === 0) return [];

    // Determine if this space should have no history (25% probability)
    const hash = space.id
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const shouldHaveNoHistory = hash % 4 === 0;

    if (shouldHaveNoHistory) return [];

    // Generate at least 20 conversations, more if we have fewer originals
    const targetCount = Math.max(20, conversations.length * 4);
    return generateConversationsWithDates(conversations, targetCount, space.id);
  }, [conversations, space.id]);

  const myPodEnrichedConversations = useMemo(() => {
    if (
      podVariant !== "personal" ||
      !currentUserId ||
      hideConversationFilters
    ) {
      return expandedConversations;
    }
    return expandedConversations.map((conversation) =>
      enrichMyPodConversationParticipants(
        conversation,
        currentUserId,
        users,
        agents
      )
    );
  }, [
    agents,
    currentUserId,
    expandedConversations,
    hideConversationFilters,
    podVariant,
    users,
  ]);

  const visibleConversations = useMemo(() => {
    const source =
      podVariant === "personal"
        ? myPodEnrichedConversations
        : expandedConversations;

    return source.filter((conversation) => {
      if (podVariant === "personal" && !hideConversationFilters) {
        if (isTriggeredConversation(conversation)) {
          return false;
        }
      } else if (
        hideTriggeredConversations &&
        isTriggeredConversation(conversation)
      ) {
        return false;
      }
      if (
        hideConversationFilters ||
        podVariant !== "personal" ||
        !currentUserId
      ) {
        return true;
      }
      if (goodToKnowFilter === "mine") {
        return isMyPodMineConversation(conversation, currentUserId);
      }
      if (goodToKnowFilter === "shared") {
        return isMyPodGroupConversation(conversation);
      }
      return true;
    });
  }, [
    currentUserId,
    expandedConversations,
    goodToKnowFilter,
    hideConversationFilters,
    hideTriggeredConversations,
    myPodEnrichedConversations,
    podVariant,
  ]);

  const searchResults = useMemo((): UniversalSearchItem[] => {
    const trimmed = searchText.trim();
    if (!trimmed) {
      return [];
    }

    const searchLower = trimmed.toLowerCase();

    const documentResults = dataSources.reduce<UniversalSearchItem[]>(
      (acc, dataSource) => {
        const title = dataSource.fileName;
        const description = getFakeDocumentFirstLine(dataSource);
        const titleMatch = title.toLowerCase().includes(searchLower);
        const descriptionMatch = description
          .toLowerCase()
          .includes(searchLower);
        if (titleMatch || descriptionMatch) {
          acc.push({
            type: "document",
            dataSource,
            title,
            description,
            score: titleMatch ? 2 : 1,
          });
        }
        return acc;
      },
      []
    );

    const conversationResults = visibleConversations.reduce<
      UniversalSearchItem[]
    >((acc, conversation) => {
      const creator = getRandomCreator(conversation, users);
      const title = conversation.title;
      const description = conversation.description ?? "";
      const searchableTitle = creator ? `${creator.fullName} ${title}` : title;
      const titleMatch = searchableTitle.toLowerCase().includes(searchLower);
      const descriptionMatch = description.toLowerCase().includes(searchLower);
      if (titleMatch || descriptionMatch) {
        acc.push({
          type: "conversation",
          conversation,
          creator: creator || undefined,
          title,
          description,
          score: titleMatch ? 2 : 1,
        });
      }
      return acc;
    }, []);

    return [...documentResults, ...conversationResults].sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.title.localeCompare(b.title);
    });
  }, [dataSources, searchText, users, visibleConversations]);

  const handleSearchItemSelect = (item: UniversalSearchItem) => {
    if (item.type === "document") {
      if (isDataSourceFolder(item.dataSource)) {
        setActiveTab("knowledge");
        setCurrentFolderId(item.dataSource.id);
        setKnowledgeSearchText("");
        setRevealedFileIdInKnowledge(null);
      } else if (onFileOpen) {
        onFileOpen(item.dataSource);
      } else {
        setSelectedDataSource(item.dataSource);
        setIsDocumentSheetOpen(true);
      }
      setIsSearchOpen(false);
      return;
    }

    const baseConversationId = getBaseConversationId(
      item.conversation,
      conversations
    );
    onConversationClick?.({
      ...item.conversation,
      id: baseConversationId,
    });
    setIsSearchOpen(false);
  };

  const SearchResultItem = ({
    item,
    selected,
  }: {
    item: UniversalSearchItem;
    selected: boolean;
  }) => {
    const isDocument = item.type === "document";
    const key = isDocument ? item.dataSource.id : item.conversation.id;
    const onClick = () => handleSearchItemSelect(item);
    const description = isDocument
      ? item.description
      : item.description || "No description available.";
    const visual = isDocument ? (
      item.dataSource.icon ? (
        <Icon visual={item.dataSource.icon} size="md" />
      ) : null
    ) : item.creator ? (
      <Avatar
        name={item.creator.fullName}
        visual={item.creator.portrait}
        size="xs"
        isRounded={true}
      />
    ) : null;
    const titlePrefix =
      !isDocument && item.creator ? item.creator.fullName : "";

    const title = titlePrefix ? (
      <>
        <span className="shrink-0">{titlePrefix}</span>
        <span className="min-w-0 truncate text-muted-foreground">
          {item.title}
        </span>
      </>
    ) : (
      <span className="min-w-0 truncate">{item.title}</span>
    );

    return (
      <UniversalSearchItem
        key={key}
        onClick={onClick}
        selected={selected}
        hasSeparator={false}
        visual={visual}
        title={title}
        description={description}
      />
    );
  };

  // Group conversations by date bucket
  const conversationsByBucket = useMemo(() => {
    const buckets: {
      Today: Conversation[];
      Yesterday: Conversation[];
      "Last Week": Conversation[];
      "Last Month": Conversation[];
    } = {
      Today: [],
      Yesterday: [],
      "Last Week": [],
      "Last Month": [],
    };

    visibleConversations.forEach((conversation) => {
      const bucket = getDateBucket(conversation.updatedAt);
      buckets[bucket].push(conversation);
    });

    // Sort each bucket by updatedAt (most recent first)
    Object.keys(buckets).forEach((key) => {
      const bucketKey = key as keyof typeof buckets;
      buckets[bucketKey].sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      );
    });

    return buckets;
  }, [visibleConversations]);

  // Determine if space is new (no conversations and no members)
  const isNew = useMemo(() => {
    return (
      conversations.length === 0 &&
      (!spaceMemberIds || spaceMemberIds.length === 0)
    );
  }, [conversations.length, spaceMemberIds]);

  // Get avatar count (3-15) based on space ID for deterministic randomness
  const avatarCount = useMemo(() => {
    const hash = space.id
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return 3 + (hash % 13); // 3 to 15
  }, [space.id]);

  // Get avatars for this space - deterministic per space, or from invited members
  const spaceAvatars = useMemo(() => {
    // New spaces show no avatars
    if (isNew) return [];

    // If space has invited members, use those
    if (spaceMemberIds.length > 0) {
      const memberAvatars: Array<{
        name: string;
        visual?: string;
        isRounded: boolean;
      }> = [];
      spaceMemberIds.forEach((id) => {
        const user = users.find((u) => u.id === id);
        if (user) {
          memberAvatars.push({
            name: user.fullName,
            visual: user.portrait,
            isRounded: true,
          });
        }
      });
      return memberAvatars;
    }

    // Generate deterministic random avatars based on space.id
    const shuffled = [...users].sort((a, b) => {
      const aHash = space.id + a.id;
      const bHash = space.id + b.id;
      return seededRandom(aHash, 0) - seededRandom(bHash, 0);
    });
    return shuffled.slice(0, avatarCount).map((user) => ({
      name: user.fullName,
      visual: user.portrait,
      isRounded: true,
    }));
  }, [space.id, isNew, spaceMemberIds, users, avatarCount]);

  const hasHistory = expandedConversations.length > 0;

  const conversationTitleById = useMemo(() => {
    const titleMap = new Map<string, string>();
    expandedConversations.forEach((conversation) => {
      titleMap.set(conversation.id, conversation.title);
    });
    return titleMap;
  }, [expandedConversations]);

  const conversationListItemsById = useMemo(() => {
    const itemMap = new Map<
      string,
      {
        avatarProps: ReturnType<typeof participantsToAvatarProps>;
        creator: User | null;
        mentionCount: number;
        messageCount: number;
        replyCount: number;
        time: string;
      }
    >();

    visibleConversations.forEach((conversation) => {
      const rowSeed = `${space.id}-${conversation.id}-list-item`;
      const participants = getRandomParticipants(conversation, users, agents);
      const replyCount = Math.floor(seededRandom(rowSeed, 0) * 8) + 1;
      const messageCount =
        Math.floor(seededRandom(rowSeed, 1) * replyCount) + 1;
      const mentionCount = Math.floor(
        seededRandom(rowSeed, 2) * (messageCount + 1)
      );

      itemMap.set(conversation.id, {
        avatarProps: participantsToAvatarProps(participants),
        creator: getRandomCreator(conversation, users),
        mentionCount,
        messageCount,
        replyCount,
        time: conversation.updatedAt
          .toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
          .replace("24:", "00:"),
      });
    });

    return itemMap;
  }, [agents, space.id, users, visibleConversations]);

  const getAutoCheckRationales = (
    summary: OngoingSummary,
    relatedConversations: SummaryRelatedConversations,
    autoCheckedItemIds: string[]
  ): AutoCheckRationaleByKey => {
    const rationales: AutoCheckRationaleByKey = {};

    autoCheckedItemIds.forEach((itemId) => {
      const needAttentionItem = summary.needAttention.find(
        (item) => item.id === itemId
      );
      if (needAttentionItem) {
        const itemKey = getSummaryItemKey("needAttention", needAttentionItem);
        const relatedTitles = (relatedConversations[itemKey] ?? []).map(
          (conversationId) =>
            conversationTitleById.get(conversationId) ?? conversationId
        );
        rationales[itemKey] = buildAutoCheckRationale(
          needAttentionItem.text,
          relatedTitles
        );
      }

      const keyDecisionItem = summary.keyDecisions.find(
        (item) => item.id === itemId
      );
      if (keyDecisionItem) {
        const itemKey = getSummaryItemKey("keyDecisions", keyDecisionItem);
        const relatedTitles = (relatedConversations[itemKey] ?? []).map(
          (conversationId) =>
            conversationTitleById.get(conversationId) ?? conversationId
        );
        rationales[itemKey] = buildAutoCheckRationale(
          keyDecisionItem.text,
          relatedTitles
        );
      }
    });

    return rationales;
  };

  const formatSummaryUpdatedAt = (date: Date): string => {
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(0, Math.floor(diffMs / (60 * 1000)));

    if (diffMinutes < 1) {
      return "just now";
    }
    if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const scrollToConversationRow = (conversationId: string) => {
    const element = document.getElementById(
      getConversationRowDomId(conversationId)
    );
    if (!element) {
      return;
    }

    if (showFocusTimeoutRef.current !== null) {
      window.clearTimeout(showFocusTimeoutRef.current);
      showFocusTimeoutRef.current = null;
    }

    setConversationIdToShowFocus(null);
    element.scrollIntoView({ behavior: "smooth", block: "center" });

    showFocusTimeoutRef.current = window.setTimeout(() => {
      setConversationIdToShowFocus(conversationId);
      showFocusTimeoutRef.current = null;
    }, 500);
  };

  const renderProjectPulseItemWithInlineLinks = (
    item: ProjectPulseItem,
    relatedConversationIds: string[],
    isChecked: boolean
  ): ReactNode => {
    let linkedSegmentIndex = 0;

    return item.segments.map((segment, index) => {
      if (segment.type === "text") {
        return (
          <span key={`${item.id}-text-${index}`}>
            {renderSummaryItemWithEmphasizedNames(segment.text)}
          </span>
        );
      }

      const conversationId = relatedConversationIds[linkedSegmentIndex];
      linkedSegmentIndex += 1;

      if (!conversationId || isChecked) {
        return (
          <span key={`${item.id}-link-${index}`} className="underline">
            {segment.text}
          </span>
        );
      }

      return (
        <button
          key={`${item.id}-link-${index}`}
          type="button"
          className="underline hover:no-underline"
          onClick={(event) => {
            event.stopPropagation();
            scrollToConversationRow(conversationId);
          }}
        >
          {segment.text}
        </button>
      );
    });
  };

  useEffect(() => {
    const itemKeyToFocus = pendingFocusTodoItemKeyRef.current;
    if (!itemKeyToFocus) {
      return;
    }

    const editor = todoItemEditorRefs.current.get(itemKeyToFocus);
    if (!editor) {
      return;
    }

    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
    pendingFocusTodoItemKeyRef.current = null;
  });

  useEffect(() => {
    if (
      selectedConversationRow &&
      selectedConversationRow.conversationId !== selectedConversationId
    ) {
      setSelectedConversationRow(null);
    }
  }, [selectedConversationId, selectedConversationRow]);

  useEffect(() => {
    return () => {
      if (showFocusTimeoutRef.current !== null) {
        window.clearTimeout(showFocusTimeoutRef.current);
      }
      if (deltaTransitionStartTimeoutRef.current !== null) {
        window.clearTimeout(deltaTransitionStartTimeoutRef.current);
      }
      if (deltaTransitionTimeoutRef.current !== null) {
        window.clearTimeout(deltaTransitionTimeoutRef.current);
      }
      if (cleanTransitionTimeoutRef.current !== null) {
        window.clearTimeout(cleanTransitionTimeoutRef.current);
      }
      if (autoCleanTimeoutRef.current !== null) {
        window.clearTimeout(autoCleanTimeoutRef.current);
      }
      if (todoSuggestionTimeoutRef.current !== null) {
        window.clearTimeout(todoSuggestionTimeoutRef.current);
      }
    };
  }, []);

  // Handle room name save confirmation
  const handleNameSaveConfirm = () => {
    onUpdateSpaceName?.(space.id, roomName);
    setIsEditingName(false);
    setShowNameSaveDialog(false);
  };

  // Handle public toggle confirmation
  const handlePublicToggleConfirm = () => {
    if (pendingPublicValue !== null) {
      setIsPublic(pendingPublicValue);
      onUpdateSpacePublic?.(space.id, pendingPublicValue);
      setPendingPublicValue(null);
    }
    setShowPublicToggleDialog(false);
  };

  const handleArchiveProject = () => {
    setIsProjectArchived(true);
    setArchivedAt(new Date());
    setArchivedByName(users[0]?.fullName ?? users[0]?.email ?? "Unknown");
  };

  const handleUnarchiveProject = () => {
    setIsProjectArchived(false);
    setArchivedAt(null);
    setArchivedByName(null);
  };

  // Reset room name when space changes
  useEffect(() => {
    setRoomName(space.name);
    setIsEditingName(false);
    setRoomDescription(space.description ?? "");
    setIsEditingDescription(false);
    setEditorIds(editorUserIds);
    setIsPublic(spacePublicSettings?.get(space.id) ?? space.isPublic ?? true);
    setIsProjectArchived(false);
    setArchivedAt(null);
    setArchivedByName(null);
    setShowDeleteProjectDialog(false);
    setDeleteConfirmDraft("");
  }, [space.id, space.name, spacePublicSettings, space.isPublic]);

  useEffect(() => {
    setEditorIds(editorUserIds);
  }, [editorUserIds]);

  useEffect(() => {
    if (!hasHistory) {
      setOngoingSummary(null);
      setIsSummaryUpdating(false);
      setSummaryRelatedConversations({});
      setSummaryItemDiffByKey({});
      setAutoCheckRationaleByKey({});
      setTypingItemKeys(new Set());
      setEnteringItemKeys(new Set());
      setExitingItemKeys(new Set());
      return;
    }

    const scenario = buildWhatsNewScenario(space.name, expandedConversations);
    const initialSummary = scenario.before;
    const withScenarioAutoChecks = (
      previousChecked: Record<string, boolean>,
      summary: OngoingSummary
    ): Record<string, boolean> => {
      const validKeys = new Set(getSummaryItemKeys(summary));
      const nextChecked = Object.fromEntries(
        Object.entries(previousChecked).filter(
          ([key, checked]) => checked && validKeys.has(key)
        )
      );

      scenario.autoCheckedItemIds.forEach((itemId) => {
        if (summary.needAttention.some((item) => item.id === itemId)) {
          nextChecked[`needAttention::${itemId}`] = true;
        }
        if (summary.keyDecisions.some((item) => item.id === itemId)) {
          nextChecked[`keyDecisions::${itemId}`] = true;
        }
      });

      return nextChecked;
    };

    setOngoingSummary(initialSummary);
    setIsSummaryUpdating(true);
    setSummaryRelatedConversations(
      buildRandomSummaryRelatedConversations(
        initialSummary,
        expandedConversations
      )
    );
    setCheckedSummaryItems({});
    setSummaryItemDiffByKey({});
    setAutoCheckRationaleByKey({});
    setTypingItemKeys(new Set());
    setEnteringItemKeys(new Set());
    setExitingItemKeys(new Set());
    setHiddenFakeTodoItemKeys(new Set());

    const generationDelayMs = (8 + Math.floor(Math.random() * 13)) * 1000;

    const summaryTimeoutId = window.setTimeout(() => {
      setOngoingSummary((previous) => {
        const previousSummary = previous ?? initialSummary;
        const updatedSummary = { ...scenario.after, updatedAt: new Date() };
        const diffByKey = computeSummaryDiffByKey(
          previousSummary,
          updatedSummary
        );
        const removedChecklistItemKeys = getChecklistRemovedItemKeys(
          previousSummary,
          updatedSummary
        );
        const addedChecklistItemKeys = Object.entries(diffByKey)
          .filter(
            ([key, diff]) =>
              (key.startsWith("needAttention::") ||
                key.startsWith("keyDecisions::")) &&
              diff === "added"
          )
          .map(([key]) => key);
        const keysToType = new Set(
          Object.entries(diffByKey)
            .filter(
              ([key, diff]) =>
                diff === "modified" ||
                (key.startsWith("projectPulse::") && diff === "added")
            )
            .map(([key]) => key)
        );

        const transitionalSummary =
          buildSummaryWithTemporaryRemovedChecklistItems(
            previousSummary,
            updatedSummary
          );

        setSummaryItemDiffByKey(diffByKey);
        setTypingItemKeys(keysToType);
        setTypingVersion((previousVersion) => previousVersion + 1);
        setEnteringItemKeys(new Set());
        setExitingItemKeys(new Set());

        if (deltaTransitionStartTimeoutRef.current !== null) {
          window.clearTimeout(deltaTransitionStartTimeoutRef.current);
        }
        deltaTransitionStartTimeoutRef.current = window.setTimeout(() => {
          setEnteringItemKeys(new Set(addedChecklistItemKeys));
          setExitingItemKeys(new Set(removedChecklistItemKeys));
          deltaTransitionStartTimeoutRef.current = null;
        }, 0);

        setCheckedSummaryItems((previousChecked) =>
          withScenarioAutoChecks(previousChecked, transitionalSummary)
        );
        const transitionalRelatedConversations =
          buildRandomSummaryRelatedConversations(
            transitionalSummary,
            expandedConversations
          );
        setSummaryRelatedConversations(transitionalRelatedConversations);
        setAutoCheckRationaleByKey(
          getAutoCheckRationales(
            transitionalSummary,
            transitionalRelatedConversations,
            scenario.autoCheckedItemIds
          )
        );

        if (deltaTransitionTimeoutRef.current !== null) {
          window.clearTimeout(deltaTransitionTimeoutRef.current);
        }
        deltaTransitionTimeoutRef.current = window.setTimeout(() => {
          setOngoingSummary(updatedSummary);
          const updatedRelatedConversations =
            buildRandomSummaryRelatedConversations(
              updatedSummary,
              expandedConversations
            );
          setSummaryRelatedConversations(updatedRelatedConversations);
          setAutoCheckRationaleByKey(
            getAutoCheckRationales(
              updatedSummary,
              updatedRelatedConversations,
              scenario.autoCheckedItemIds
            )
          );
          setCheckedSummaryItems((previousChecked) =>
            withScenarioAutoChecks(previousChecked, updatedSummary)
          );
          setExitingItemKeys(new Set());
          deltaTransitionTimeoutRef.current = null;
        }, SUMMARY_ITEM_TRANSITION_MS);

        return transitionalSummary;
      });
      setIsSummaryUpdating(false);
    }, generationDelayMs);

    return () => {
      window.clearTimeout(summaryTimeoutId);
      if (deltaTransitionStartTimeoutRef.current !== null) {
        window.clearTimeout(deltaTransitionStartTimeoutRef.current);
        deltaTransitionStartTimeoutRef.current = null;
      }
      if (deltaTransitionTimeoutRef.current !== null) {
        window.clearTimeout(deltaTransitionTimeoutRef.current);
        deltaTransitionTimeoutRef.current = null;
      }
    };
  }, [expandedConversations, hasHistory, space.id, space.name]);

  // Reset data sources when space changes
  useEffect(() => {
    setDataSources(getDataSourcesBySpaceId(space.id));
    setCurrentFolderId(null);
    setRevealedFileIdInKnowledge(null);
    setDraggingFileId(null);
    setDropHoverTargetId(null);
  }, [space.id]);

  useEffect(() => {
    if (!fileToRevealInKnowledge) {
      return;
    }

    const file = dataSources.find(
      (item) => item.id === fileToRevealInKnowledge
    );
    if (!file || isDataSourceFolder(file)) {
      onFileToRevealInKnowledgeHandled?.();
      return;
    }

    setActiveTab("knowledge");
    setCurrentFolderId(file.parentId);
    setKnowledgeSearchText("");
    setRevealedFileIdInKnowledge(file.id);
    onFileToRevealInKnowledgeHandled?.();
  }, [
    dataSources,
    fileToRevealInKnowledge,
    onFileToRevealInKnowledgeHandled,
    setActiveTab,
  ]);

  const handleFileDragEnd = useCallback(() => {
    setDraggingFileId(null);
    setDropHoverTargetId(null);
    onFileDragChange?.(null, null);
  }, [onFileDragChange]);

  const handleMoveFile = useCallback(
    (fileId: string, targetParentId: string | null) => {
      setDataSources((prev) => moveDataSource(prev, fileId, targetParentId));
      setDraggingFileId(null);
      setDropHoverTargetId(null);
      onFileDragChange?.(null, null);
    },
    [onFileDragChange]
  );

  const handleFileDragStart = useCallback(
    (
      fileId: string,
      fileName: string,
      event: DragEvent<HTMLTableRowElement>
    ) => {
      event.dataTransfer.setData("text/plain", fileId);
      event.dataTransfer.setData(DATA_SOURCE_FILE_DRAG_MIME, "file");
      event.dataTransfer.setData(DATA_SOURCE_FILE_NAME_DRAG_MIME, fileName);
      event.dataTransfer.effectAllowed = "copyMove";
      setDraggingFileId(fileId);
      onFileDragChange?.(fileId, fileName);
    },
    [onFileDragChange]
  );

  useEffect(() => {
    if (draggingFileId === null) {
      return;
    }

    const endFileDrag = () => {
      setDraggingFileId(null);
      setDropHoverTargetId(null);
      onFileDragChange?.(null, null);
    };

    document.addEventListener("dragend", endFileDrag);
    document.addEventListener("drop", endFileDrag);

    return () => {
      document.removeEventListener("dragend", endFileDrag);
      document.removeEventListener("drop", endFileDrag);
    };
  }, [draggingFileId, onFileDragChange]);

  const handleDragOverTarget = useCallback(
    (targetId: string, event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDropHoverTargetId(targetId);
    },
    []
  );

  const handleDropOnTarget = useCallback(
    (
      targetId: string,
      targetParentId: string | null,
      event: DragEvent<HTMLElement>
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const fileId = event.dataTransfer.getData("text/plain") || draggingFileId;
      if (!fileId) {
        return;
      }

      const file = dataSources.find((item) => item.id === fileId);
      if (!file || file.parentId === targetParentId) {
        handleFileDragEnd();
        return;
      }

      handleMoveFile(fileId, targetParentId);
    },
    [dataSources, draggingFileId, handleFileDragEnd, handleMoveFile]
  );

  // Transform spaceMemberIds into Member objects with joinedAt dates
  const members: Member[] = useMemo(() => {
    if (!spaceMemberIds || spaceMemberIds.length === 0) {
      return [];
    }
    const memberList: Member[] = [];
    spaceMemberIds.forEach((memberId) => {
      const user = getUserById(memberId);
      if (user) {
        memberList.push({
          userId: memberId,
          joinedAt: generateJoinedAt(space.id, memberId),
          onClick: () => {
            setSelectedMember(user);
            setIsMemberSheetOpen(true);
          },
        });
      }
    });
    return memberList;
  }, [spaceMemberIds, space.id]);

  const todoParticipants = useMemo((): User[] => {
    const participantById = new Map<string, User>();

    spaceMemberIds.forEach((userId) => {
      const user = getUserById(userId);
      if (user) {
        participantById.set(userId, user);
      }
    });

    if (participantById.size === 0) {
      expandedConversations.forEach((conversation) => {
        conversation.userParticipants.forEach((userId) => {
          const user = getUserById(userId);
          if (user) {
            participantById.set(userId, user);
          }
        });
      });
    }

    const mockCurrentUser = users[0];
    if (mockCurrentUser) {
      participantById.set(mockCurrentUser.id, mockCurrentUser);
    }

    [...users]
      .sort(
        (a, b) =>
          seededRandom(`${space.id}-${a.id}-todo-participant`, 0) -
          seededRandom(`${space.id}-${b.id}-todo-participant`, 0)
      )
      .forEach((user) => participantById.set(user.id, user));

    return Array.from(participantById.values()).slice(0, 8);
  }, [expandedConversations, space.id, spaceMemberIds, users]);

  const reassignTodoParticipants = useMemo(() => {
    const normalizedSearch = todoReassignSearchText.trim().toLowerCase();
    if (normalizedSearch.length === 0) {
      return todoParticipants;
    }

    return todoParticipants.filter((user) =>
      user.fullName.toLowerCase().includes(normalizedSearch)
    );
  }, [todoParticipants, todoReassignSearchText]);

  useEffect(() => {
    if (
      hasSeededParticipantTodoSuggestionsRef.current ||
      todoParticipants.length === 0
    ) {
      return;
    }

    hasSeededParticipantTodoSuggestionsRef.current = true;
    const suggestionsByUserId: Record<string, TodoSuggestionItem[]> = {};

    todoParticipants.slice(0, 2).forEach((participant, participantIndex) => {
      suggestionsByUserId[participant.id] = [0, 1].map((offset) => {
        const suggestionIndex =
          (participantIndex * 2 + offset) %
          PARTICIPANT_TODO_SUGGESTION_TEXTS.length;
        return {
          id: `participant-suggestion-${participant.id}-${offset}`,
          userId: participant.id,
          text: PARTICIPANT_TODO_SUGGESTION_TEXTS[suggestionIndex],
        };
      });
    });

    setParticipantTodoSuggestionsByUserId(suggestionsByUserId);
  }, [todoParticipants]);

  const generateTodoSuggestions = useCallback(
    (prompt: string): TodoSuggestionItem[] => {
      if (todoParticipants.length === 0) {
        return [];
      }

      const normalizedPrompt = prompt.trim();
      const suggestionCount = Math.min(4, Math.max(2, todoParticipants.length));
      const promptSuggestion: ChecklistItem = {
        id: "prompt-suggestion",
        text: normalizedPrompt.endsWith(".")
          ? normalizedPrompt
          : `${normalizedPrompt}.`,
      };
      const suggestionPool = [
        promptSuggestion,
        ...TODO_SUGGESTION_TEXTS.map((text, index) => ({
          id: `template-${index}`,
          text,
        })),
      ];

      return suggestionPool.slice(0, suggestionCount).map((item, index) => {
        const participant =
          todoParticipants[
            Math.floor(
              seededRandom(`${space.id}-${normalizedPrompt}-${index}`, 0) *
                todoParticipants.length
            )
          ] ?? todoParticipants[index % todoParticipants.length];

        return {
          id: `todo-suggestion-${todoSuggestionCounterRef.current + index}`,
          userId: participant.id,
          text: item.text,
        };
      });
    },
    [space.id, todoParticipants]
  );

  const generateProjectSetupTodoSuggestions =
    useCallback((): TodoSuggestionItem[] => {
      const participant = todoParticipants[0];
      if (!participant) {
        return [];
      }

      return PROJECT_SETUP_TODO_SUGGESTION_TEXTS.map((text, index) => {
        return {
          id: `todo-suggestion-${todoSuggestionCounterRef.current + index}`,
          userId: participant.id,
          text,
        };
      });
    }, [todoParticipants]);

  const participantTodoLists = useMemo((): ParticipantTodoList[] => {
    const mockCurrentUser = users[0];
    if (podVariant === "personal") {
      if (!mockCurrentUser) {
        return [];
      }

      const list: ParticipantTodoList = { user: mockCurrentUser, items: [] };

      if (ongoingSummary) {
        const fakeTodoItems = [...FAKE_PROJECT_TODO_ITEMS]
          .sort(
            (a, b) =>
              seededRandom(`${space.id}-${a.id}-fake-todo`, 0) -
              seededRandom(`${space.id}-${b.id}-fake-todo`, 0)
          )
          .slice(0, 8)
          .filter(
            (item) =>
              !hiddenFakeTodoItemKeys.has(
                getSummaryItemKey("needAttention", item)
              )
          );
        list.items.push(...ongoingSummary.needAttention, ...fakeTodoItems);
      }

      list.items.push(...(todoDraftItemsByUserId[mockCurrentUser.id] ?? []));

      return [list];
    }

    if (todoParticipants.length === 0) {
      return [];
    }

    const lists: ParticipantTodoList[] = todoParticipants.map((user) => ({
      user,
      items: [],
    }));

    if (ongoingSummary) {
      const fakeTodoItems = [...FAKE_PROJECT_TODO_ITEMS]
        .sort(
          (a, b) =>
            seededRandom(`${space.id}-${a.id}-fake-todo`, 0) -
            seededRandom(`${space.id}-${b.id}-fake-todo`, 0)
        )
        .slice(0, Math.max(8, todoParticipants.length * 2))
        .filter(
          (item) =>
            !hiddenFakeTodoItemKeys.has(
              getSummaryItemKey("needAttention", item)
            )
        );
      const todoItems = [...ongoingSummary.needAttention, ...fakeTodoItems];

      todoItems.forEach((item, index) => {
        lists[index % lists.length].items.push(item);
      });
    }

    lists.forEach((list) => {
      list.items.push(...(todoDraftItemsByUserId[list.user.id] ?? []));
    });

    return lists;
  }, [
    hiddenFakeTodoItemKeys,
    ongoingSummary,
    podVariant,
    space.id,
    todoDraftItemsByUserId,
    todoParticipants,
    users,
  ]);

  const closedParticipantTodoLists = useMemo((): ParticipantTodoList[] => {
    const mockCurrentUser = users[0];
    if (podVariant === "personal") {
      if (!mockCurrentUser) {
        return [];
      }

      return [
        {
          user: mockCurrentUser,
          items: getFakeClosedTodoItemsForFilter(todoHistoryFilter).sort(
            (a, b) =>
              seededRandom(`${space.id}-${todoHistoryFilter}-${a.id}`, 0) -
              seededRandom(`${space.id}-${todoHistoryFilter}-${b.id}`, 0)
          ),
        },
      ];
    }

    if (todoParticipants.length === 0) {
      return [];
    }

    const todoItems = getFakeClosedTodoItemsForFilter(todoHistoryFilter).sort(
      (a, b) =>
        seededRandom(`${space.id}-${todoHistoryFilter}-${a.id}`, 0) -
        seededRandom(`${space.id}-${todoHistoryFilter}-${b.id}`, 0)
    );

    const lists: ParticipantTodoList[] = todoParticipants.map((user) => ({
      user,
      items: [],
    }));
    todoItems.forEach((item, index) => {
      lists[index % lists.length].items.push(item);
    });

    return lists;
  }, [podVariant, space.id, todoHistoryFilter, todoParticipants, users]);

  const closedTodoItemKeys = useMemo(
    () =>
      new Set(
        getFakeClosedTodoItemsForFilter(todoHistoryFilter).map((item) =>
          getSummaryItemKey("needAttention", item)
        )
      ),
    [todoHistoryFilter]
  );

  const displayedParticipantTodoLists =
    todoHistoryFilter === "ongoing"
      ? participantTodoLists
      : closedParticipantTodoLists;

  const visibleParticipantTodoLists = useMemo((): ParticipantTodoList[] => {
    const normalizedSearch = todoSearchText.trim().toLowerCase();
    const mockCurrentUserId = users[0]?.id;

    return displayedParticipantTodoLists
      .filter((list) =>
        podVariant === "personal"
          ? list.user.id === mockCurrentUserId
          : todoScopeFilter === "all" || list.user.id === mockCurrentUserId
      )
      .map((list) => ({
        ...list,
        items:
          normalizedSearch.length === 0 ||
          list.user.fullName.toLowerCase().includes(normalizedSearch)
            ? list.items.filter(
                (item) =>
                  !deletedTodoItemKeys.has(
                    getSummaryItemKey("needAttention", item)
                  )
              )
            : list.items.filter((item) => {
                const itemKey = getSummaryItemKey("needAttention", item);
                const itemText = todoItemTextByKey[itemKey] ?? item.text;
                return (
                  !deletedTodoItemKeys.has(itemKey) &&
                  itemText.toLowerCase().includes(normalizedSearch)
                );
              }),
      }));
  }, [
    deletedTodoItemKeys,
    displayedParticipantTodoLists,
    todoItemTextByKey,
    todoScopeFilter,
    todoSearchText,
    users,
    podVariant,
  ]);
  const hasDisplayedTodoItems = displayedParticipantTodoLists.some(
    (list) => list.items.length > 0
  );
  const hasVisibleTodoItems = visibleParticipantTodoLists.some(
    (list) => list.items.length > 0
  );
  const shouldShowTodoLists =
    (hasHistory && ongoingSummary !== null) || hasDisplayedTodoItems;

  const handleCleanTodoItems = useCallback(() => {
    const checkedKeys = new Set(
      Object.entries(checkedSummaryItems)
        .filter(
          ([key, checked]) => checked && key.startsWith("needAttention::")
        )
        .map(([key]) => key)
    );

    if (checkedKeys.size === 0) {
      return;
    }

    const checkedKeysArray = Array.from(checkedKeys);
    const fakeTodoItemKeys = new Set(
      FAKE_PROJECT_TODO_ITEMS.map((item) =>
        getSummaryItemKey("needAttention", item)
      )
    );
    const checkedFakeTodoKeys = checkedKeysArray.filter((key) =>
      fakeTodoItemKeys.has(key)
    );

    setExitingItemKeys(
      (previousExiting) => new Set([...previousExiting, ...checkedKeysArray])
    );

    if (cleanTransitionTimeoutRef.current !== null) {
      window.clearTimeout(cleanTransitionTimeoutRef.current);
    }

    cleanTransitionTimeoutRef.current = window.setTimeout(() => {
      setOngoingSummary((previousSummary) => {
        if (!previousSummary) {
          return previousSummary;
        }
        const updatedSummary = {
          ...previousSummary,
          needAttention: previousSummary.needAttention.filter(
            (item) => !checkedKeys.has(getSummaryItemKey("needAttention", item))
          ),
        };
        setSummaryRelatedConversations((previousLinks) => {
          const validKeys = new Set(getSummaryItemKeys(updatedSummary));
          return Object.fromEntries(
            Object.entries(previousLinks).filter(([key]) => validKeys.has(key))
          );
        });
        return updatedSummary;
      });

      setCheckedSummaryItems((previousChecked) =>
        Object.fromEntries(
          Object.entries(previousChecked).filter(
            ([key]) => !checkedKeys.has(key)
          )
        )
      );
      setSummaryItemDiffByKey((previousDiffByKey) =>
        Object.fromEntries(
          Object.entries(previousDiffByKey).filter(
            ([key]) => !checkedKeys.has(key)
          )
        )
      );
      setAutoCheckRationaleByKey((previousAutoCheckRationaleByKey) =>
        Object.fromEntries(
          Object.entries(previousAutoCheckRationaleByKey).filter(
            ([key]) => !checkedKeys.has(key)
          )
        )
      );
      setHiddenFakeTodoItemKeys(
        (previousHiddenFakeTodoItemKeys) =>
          new Set([...previousHiddenFakeTodoItemKeys, ...checkedFakeTodoKeys])
      );
      setTodoDraftItemsByUserId((previousDraftItemsByUserId) => {
        const nextDraftItemsByUserId = Object.fromEntries(
          Object.entries(previousDraftItemsByUserId)
            .map(([userId, draftItems]) => [
              userId,
              draftItems.filter(
                (item) =>
                  !checkedKeys.has(getSummaryItemKey("needAttention", item))
              ),
            ])
            .filter(([, draftItems]) => draftItems.length > 0)
        );
        return nextDraftItemsByUserId;
      });
      setTypingItemKeys((previousTypingItemKeys) => {
        const nextTypingItemKeys = new Set(previousTypingItemKeys);
        checkedKeysArray.forEach((key) => nextTypingItemKeys.delete(key));
        return nextTypingItemKeys;
      });
      setExitingItemKeys((previousExiting) => {
        const nextExiting = new Set(previousExiting);
        checkedKeysArray.forEach((key) => nextExiting.delete(key));
        return nextExiting;
      });
      cleanTransitionTimeoutRef.current = null;
    }, SUMMARY_ITEM_TRANSITION_MS);
  }, [checkedSummaryItems]);

  const saveTodoItemText = useCallback(
    (itemKey: string, originalText: string, nextText: string) => {
      setTodoItemTextByKey((previousTextByKey) => {
        const updatedTextByKey = { ...previousTextByKey };
        if (nextText === originalText) {
          delete updatedTextByKey[itemKey];
        } else {
          updatedTextByKey[itemKey] = nextText;
        }
        return updatedTextByKey;
      });
    },
    []
  );

  const removeTodoItem = useCallback((itemKey: string) => {
    setDeletedTodoItemKeys(
      (previousDeletedTodoItemKeys) =>
        new Set([...previousDeletedTodoItemKeys, itemKey])
    );
    setCheckedSummaryItems((previousChecked) => {
      const nextChecked = { ...previousChecked };
      delete nextChecked[itemKey];
      return nextChecked;
    });
    setTodoItemTextByKey((previousTextByKey) => {
      const nextTextByKey = { ...previousTextByKey };
      delete nextTextByKey[itemKey];
      return nextTextByKey;
    });
    setTodoDraftItemsByUserId((previousDraftItemsByUserId) => {
      const nextDraftItemsByUserId = Object.fromEntries(
        Object.entries(previousDraftItemsByUserId)
          .map(([userId, draftItems]) => [
            userId,
            draftItems.filter(
              (item) => getSummaryItemKey("needAttention", item) !== itemKey
            ),
          ])
          .filter(([, draftItems]) => draftItems.length > 0)
      );
      return nextDraftItemsByUserId;
    });
  }, []);

  const addDraftTodoItemAfter = useCallback(
    (userId: string, previousItemKey: string) => {
      const draftItem: ChecklistItem = {
        id: `draft-todo-${todoDraftItemCounterRef.current}`,
        text: "",
      };
      todoDraftItemCounterRef.current += 1;

      const draftItemKey = getSummaryItemKey("needAttention", draftItem);
      pendingFocusTodoItemKeyRef.current = draftItemKey;

      setTodoDraftItemsByUserId((previousDraftItemsByUserId) => {
        const previousDraftItems = previousDraftItemsByUserId[userId] ?? [];
        const previousDraftItemIndex = previousDraftItems.findIndex(
          (item) => getSummaryItemKey("needAttention", item) === previousItemKey
        );
        const nextDraftItems = [...previousDraftItems];

        if (previousDraftItemIndex === -1) {
          nextDraftItems.push(draftItem);
        } else {
          nextDraftItems.splice(previousDraftItemIndex + 1, 0, draftItem);
        }

        return {
          ...previousDraftItemsByUserId,
          [userId]: nextDraftItems,
        };
      });
    },
    []
  );

  const acceptTodoSuggestions = useCallback(
    (suggestionsToAccept: TodoSuggestionItem[]) => {
      const nonEmptySuggestions = suggestionsToAccept
        .map((suggestion) => ({
          ...suggestion,
          text: (
            todoSuggestionTextById[suggestion.id] ?? suggestion.text
          ).trim(),
        }))
        .filter((suggestion) => suggestion.text.length > 0);

      if (nonEmptySuggestions.length === 0) {
        return;
      }

      setTodoDraftItemsByUserId((previousDraftItemsByUserId) => {
        const nextDraftItemsByUserId = { ...previousDraftItemsByUserId };

        nonEmptySuggestions.forEach((suggestion) => {
          const draftItem: ChecklistItem = {
            id: `suggested-todo-${suggestion.id}`,
            text: suggestion.text,
          };
          nextDraftItemsByUserId[suggestion.userId] = [
            ...(nextDraftItemsByUserId[suggestion.userId] ?? []),
            draftItem,
          ];
        });

        return nextDraftItemsByUserId;
      });

      const acceptedSuggestionIds = new Set(
        nonEmptySuggestions.map((suggestion) => suggestion.id)
      );
      const remainingSuggestions = todoSuggestions.filter(
        (suggestion) => !acceptedSuggestionIds.has(suggestion.id)
      );

      setTodoSuggestions(remainingSuggestions);
      if (remainingSuggestions.length === 0) {
        setTodoSuggestionStatus("idle");
      }
      setTodoSuggestionTextById((previousTextById) => {
        const nextTextById = { ...previousTextById };
        nonEmptySuggestions.forEach((suggestion) => {
          delete nextTextById[suggestion.id];
        });
        return nextTextById;
      });
    },
    [todoSuggestionTextById, todoSuggestions]
  );

  const rejectTodoSuggestions = useCallback(() => {
    if (todoSuggestionTimeoutRef.current !== null) {
      window.clearTimeout(todoSuggestionTimeoutRef.current);
      todoSuggestionTimeoutRef.current = null;
    }

    setTodoSuggestionStatus("idle");
    setTodoSuggestions([]);
    setTodoSuggestionTextById({});
  }, []);

  const acceptParticipantTodoSuggestion = useCallback(
    (suggestion: TodoSuggestionItem) => {
      const text = (
        participantTodoSuggestionTextById[suggestion.id] ?? suggestion.text
      ).trim();

      if (text.length > 0) {
        const draftItem: ChecklistItem = {
          id: `participant-suggested-todo-${suggestion.id}`,
          text,
        };
        setTodoDraftItemsByUserId((previousDraftItemsByUserId) => ({
          ...previousDraftItemsByUserId,
          [suggestion.userId]: [
            ...(previousDraftItemsByUserId[suggestion.userId] ?? []),
            draftItem,
          ],
        }));
      }

      setParticipantTodoSuggestionsByUserId((previousSuggestionsByUserId) => ({
        ...previousSuggestionsByUserId,
        [suggestion.userId]: (
          previousSuggestionsByUserId[suggestion.userId] ?? []
        ).filter((item) => item.id !== suggestion.id),
      }));
      setParticipantTodoSuggestionTextById((previousTextById) => {
        const nextTextById = { ...previousTextById };
        delete nextTextById[suggestion.id];
        return nextTextById;
      });
    },
    [participantTodoSuggestionTextById]
  );

  const rejectParticipantTodoSuggestion = useCallback(
    (suggestion: TodoSuggestionItem) => {
      setParticipantTodoSuggestionsByUserId((previousSuggestionsByUserId) => ({
        ...previousSuggestionsByUserId,
        [suggestion.userId]: (
          previousSuggestionsByUserId[suggestion.userId] ?? []
        ).filter((item) => item.id !== suggestion.id),
      }));
      setParticipantTodoSuggestionTextById((previousTextById) => {
        const nextTextById = { ...previousTextById };
        delete nextTextById[suggestion.id];
        return nextTextById;
      });
    },
    []
  );

  const startTodoSuggestions = useCallback(
    (createSuggestions: () => TodoSuggestionItem[]) => {
      if (todoSuggestionTimeoutRef.current !== null) {
        window.clearTimeout(todoSuggestionTimeoutRef.current);
      }

      setTodoSuggestionStatus("working");
      setTodoSuggestions([]);
      setTodoSuggestionTextById({});

      const delayMs = 500 + Math.floor(Math.random() * 1000);
      todoSuggestionTimeoutRef.current = window.setTimeout(() => {
        const suggestions = createSuggestions();
        todoSuggestionCounterRef.current += suggestions.length;
        setTodoSuggestions(suggestions);
        setTodoSuggestionStatus("ready");
        todoSuggestionTimeoutRef.current = null;
      }, delayMs);
    },
    []
  );

  const handleCreateTodoSuggestions = useCallback(
    (prompt: string) => {
      const normalizedPrompt = prompt.trim();
      if (normalizedPrompt.length === 0) {
        return;
      }

      startTodoSuggestions(() => generateTodoSuggestions(normalizedPrompt));
    },
    [generateTodoSuggestions, startTodoSuggestions]
  );

  const handleSetupProject = useCallback(() => {
    setActiveTab("todos");
    startTodoSuggestions(generateProjectSetupTodoSuggestions);
  }, [generateProjectSetupTodoSuggestions, setActiveTab, startTodoSuggestions]);

  useEffect(() => {
    const hasCheckedTodoItems = Object.entries(checkedSummaryItems).some(
      ([key, checked]) => checked && key.startsWith("needAttention::")
    );

    if (!hasCheckedTodoItems) {
      if (autoCleanTimeoutRef.current !== null) {
        window.clearTimeout(autoCleanTimeoutRef.current);
        autoCleanTimeoutRef.current = null;
      }
      return;
    }

    if (autoCleanTimeoutRef.current !== null) {
      window.clearTimeout(autoCleanTimeoutRef.current);
    }

    autoCleanTimeoutRef.current = window.setTimeout(() => {
      handleCleanTodoItems();
      autoCleanTimeoutRef.current = null;
    }, 5000);

    return () => {
      if (autoCleanTimeoutRef.current !== null) {
        window.clearTimeout(autoCleanTimeoutRef.current);
        autoCleanTimeoutRef.current = null;
      }
    };
  }, [checkedSummaryItems, handleCleanTodoItems]);

  // Handle remove member confirmation
  const handleRemoveMemberConfirm = () => {
    if (selectedMemberIdToRemove) {
      // For prototyping, we'll just filter from the members list
      // In a real app, this would call a callback prop
      setSelectedMemberIdToRemove(null);
    }
    setRemoveMemberDialogOpen(false);
  };

  const toggleMemberEditor = (userId: string) => {
    setEditorIds((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId);
      }
      return [...prev, userId];
    });
  };

  // Format date for display
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Create member table columns
  const memberColumns: ColumnDef<Member>[] = useMemo(
    () => [
      {
        accessorKey: "userId",
        header: "Name",
        id: "name",
        sortingFn: "text",
        meta: {
          className: "w-full",
        },
        cell: (info) => {
          const userId = info.getValue() as string;
          const user = getUserById(userId);
          if (!user) return <DataTable.BasicCellContent label="Unknown" />;
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-2">
                <Avatar
                  name={user.fullName}
                  visual={user.portrait}
                  size="xs"
                  isRounded={true}
                />
                <span className="text-sm">{user.fullName}</span>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "userId",
        header: "Email",
        id: "email",
        meta: {
          className: "w-[200px]",
        },
        cell: (info) => {
          const userId = info.getValue() as string;
          const user = getUserById(userId);
          if (!user) return <DataTable.BasicCellContent label="Unknown" />;
          return <DataTable.BasicCellContent label={user.email} />;
        },
      },
      {
        accessorKey: "userId",
        header: "Role",
        id: "role",
        meta: {
          className: "w-[120px]",
        },
        cell: (info) => {
          const userId = info.getValue() as string;
          return editorIds.includes(userId) ? (
            <DataTable.CellContent>
              <Chip size="xs" color="success" label="editor" />
            </DataTable.CellContent>
          ) : (
            <DataTable.BasicCellContent label="" />
          );
        },
      },
      {
        accessorKey: "joinedAt",
        header: "Joined at",
        id: "joinedAt",
        meta: {
          className: "w-[140px]",
        },
        cell: (info) => {
          const date = info.getValue() as Date;
          return <DataTable.BasicCellContent label={formatDate(date)} />;
        },
      },
      {
        id: "actions",
        header: "",
        meta: {
          className: "w-12",
        },
        cell: (info) => (
          <DataTable.MoreButton
            menuItems={[
              {
                kind: "item",
                icon: editorIds.includes(info.row.original.userId)
                  ? XClose
                  : Check,
                label: editorIds.includes(info.row.original.userId)
                  ? "Remove from editors"
                  : "Set as editor",
                onClick: () => {
                  toggleMemberEditor(info.row.original.userId);
                },
              },
              {
                kind: "item",
                label: "Remove from the Pod",
                icon: Trash01,
                variant: "warning",
                onClick: () => {
                  setSelectedMemberIdToRemove(info.row.original.userId);
                  setRemoveMemberDialogOpen(true);
                },
              },
            ]}
          />
        ),
      },
    ],
    [editorIds]
  );

  // Filter members based on search text
  const filteredMembers = useMemo(() => {
    if (!membersSearchText.trim()) {
      return members;
    }
    const searchLower = membersSearchText.toLowerCase();
    return members.filter((member) => {
      const user = getUserById(member.userId);
      if (!user) return false;
      return (
        user.fullName.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower)
      );
    });
  }, [members, membersSearchText]);
  const isShowingTodoSuggestions = todoSuggestionStatus !== "idle";
  const showMineGroupAll =
    !hideConversationFilters &&
    (podVariant === "personal" || spaceMemberIds.length > 1);
  const showTriggeredToggle =
    !hideConversationFilters && podVariant !== "personal";

  return (
    <div className="flex h-full w-full h-full flex-col bg-background">
      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* Conversations Tab */}
        <GroupConversationTabContent
          value="conversations"
          topBox={
            showComposer ? (
              <InputBar
                autoFocus
                placeholder="What are we working on?"
                className="w-full"
                isFloating={false}
              />
            ) : undefined
          }
        >
          {!hasHistory && showComposer && podVariant !== "personal" && (
            <ProjectSetupEmptyState onSetupProject={handleSetupProject} />
          )}
          {!hasHistory && (podVariant === "personal" || !showComposer) && (
            <EmptyState
              title="No conversations"
              description="Start a conversation from New, or pick one from Recent."
            />
          )}
          {hasHistory && (
            <div className="flex w-full flex-wrap items-center gap-2">
              {(showMineGroupAll || showTriggeredToggle) && (
                <div className="flex flex-none flex-nowrap items-center gap-2">
                  {showMineGroupAll && (
                    <ButtonsSwitchList
                      defaultValue={goodToKnowFilter}
                      onValueChange={(value) => {
                        if (
                          value === "all" ||
                          value === "shared" ||
                          value === "mine"
                        ) {
                          setGoodToKnowFilter(value);
                        }
                      }}
                    >
                      <ButtonsSwitch
                        value="mine"
                        label="Mine"
                        tooltip="Conversations where you have sent a message."
                      />
                      <ButtonsSwitch
                        value="shared"
                        label="Group"
                        tooltip="Conversations with more than one person"
                      />
                      <ButtonsSwitch
                        value="all"
                        label="All"
                        tooltip="Every conversation in this Pod."
                      />
                    </ButtonsSwitchList>
                  )}
                  {showTriggeredToggle && (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={hideTriggeredConversations ? ZapOff : Zap}
                      tooltip={
                        hideTriggeredConversations
                          ? "Show triggered"
                          : "Hide triggered"
                      }
                      className="shrink-0"
                      onClick={() =>
                        setHideTriggeredConversations((current) => !current)
                      }
                    />
                  )}
                </div>
              )}
              <div className="flex min-w-[20rem] flex-1 items-center gap-2">
                <div className="min-w-0 flex-1">
                  <SearchInputWithPopover
                    name="conversation-search"
                    value={searchText}
                    onChange={(value) => {
                      setSearchText(value);
                      if (!value.trim()) {
                        setIsSearchOpen(false);
                      }
                    }}
                    open={isSearchOpen}
                    onOpenChange={setIsSearchOpen}
                    placeholder="Search..."
                    items={searchResults}
                    availableHeight
                    noResults={
                      searchText.trim()
                        ? "No results found"
                        : "Start typing to search"
                    }
                    onItemSelect={handleSearchItemSelect}
                    renderItem={(item, selected) => (
                      <SearchResultItem item={item} selected={selected} />
                    )}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  icon={CheckDouble}
                  label="Mark all as read"
                  className="shrink-0"
                />
              </div>
            </div>
          )}
          {visibleConversations.length > 0 && (
            <>
              <div className="flex flex-col">
                {(
                  ["Today", "Yesterday", "Last Week", "Last Month"] as const
                ).map((bucketKey) => {
                  const bucketConversations = conversationsByBucket[bucketKey];
                  if (bucketConversations.length === 0) return null;

                  return (
                    <Fragment key={bucketKey}>
                      <ListItemSection className="pl-4">
                        {bucketKey}
                      </ListItemSection>
                      <ListGroup className="border-transparent! gap-0.5">
                        {bucketConversations.map((conversation) => {
                          const listItem = conversationListItemsById.get(
                            conversation.id
                          );
                          if (!listItem) {
                            return null;
                          }

                          const baseConversationId = getBaseConversationId(
                            conversation,
                            conversations
                          );

                          const conversationForLookup = {
                            ...conversation,
                            id: baseConversationId,
                          };

                          return (
                            <div
                              id={getConversationRowDomId(conversation.id)}
                              key={conversation.id}
                            >
                              <ConversationListItem
                                conversation={conversation}
                                creator={listItem.creator || undefined}
                                className="border-t-0 border-b-0 rounded-2xl hover:bg-hover"
                                time={listItem.time}
                                showFocus={
                                  conversationIdToShowFocus === conversation.id
                                }
                                replySection={
                                  <ReplySection
                                    replyCount={listItem.replyCount}
                                    unreadCount={
                                      bucketKey === "Today"
                                        ? listItem.messageCount
                                        : 0
                                    }
                                    mentionCount={
                                      bucketKey === "Today"
                                        ? listItem.mentionCount
                                        : 0
                                    }
                                    avatars={listItem.avatarProps}
                                    lastMessageBy={
                                      listItem.avatarProps[0]?.name || "Unknown"
                                    }
                                  />
                                }
                                onClick={() => {
                                  setSelectedConversationRow({
                                    rowId: conversation.id,
                                    conversationId: conversationForLookup.id,
                                  });
                                  onConversationClick?.(conversationForLookup);
                                }}
                              />
                            </div>
                          );
                        })}
                      </ListGroup>
                    </Fragment>
                  );
                })}
              </div>
            </>
          )}
        </GroupConversationTabContent>

        {/* Tasks Tab */}
        <GroupConversationTabContent
          value="todos"
          contentClassName="gap-4"
          topBox={
            <TodoInputBar
              placeholder="Describe the tasks to create"
              onCreateTasks={handleCreateTodoSuggestions}
            />
          }
        >
          {isShowingTodoSuggestions && (
            <SuggestionBox
              status={todoSuggestionStatus}
              workingLabel="Creating suggested tasks..."
              items={todoSuggestions.map((suggestion) => {
                const participant = todoParticipants.find(
                  (user) => user.id === suggestion.userId
                );

                return {
                  id: suggestion.id,
                  groupTitle: participant?.fullName ?? "Participant",
                  groupVisual: (
                    <Avatar
                      name={participant?.fullName ?? "Participant"}
                      visual={participant?.portrait}
                      size="xs"
                      isRounded
                    />
                  ),
                  text: suggestion.text,
                };
              })}
              textById={todoSuggestionTextById}
              acceptItemLabel="Add this task"
              acceptAllLabel="Accept all"
              rejectAllLabel="Cancel"
              onTextChange={(id, text) => {
                setTodoSuggestionTextById((previousTextById) => ({
                  ...previousTextById,
                  [id]: text,
                }));
              }}
              onAcceptItem={(id) => {
                const suggestion = todoSuggestions.find(
                  (item) => item.id === id
                );
                if (suggestion) {
                  acceptTodoSuggestions([suggestion]);
                }
              }}
              onAcceptAll={() => acceptTodoSuggestions(todoSuggestions)}
              onRejectAll={rejectTodoSuggestions}
            />
          )}

          {shouldShowTodoLists ? (
            <div className="flex flex-col gap-6">
              <div className="flex w-full items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {podVariant !== "personal" && (
                    <ButtonsSwitchList
                      defaultValue={todoScopeFilter}
                      size="sm"
                      onValueChange={(value) => {
                        if (value === "all" || value === "mine") {
                          setTodoScopeFilter(value);
                        }
                      }}
                    >
                      <ButtonsSwitch value="mine" label="Mine" />
                      <ButtonsSwitch value="all" label="Everyone" />
                    </ButtonsSwitchList>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        label={`Status: ${TODO_HISTORY_FILTER_LABELS[todoHistoryFilter]}`}
                        isSelect
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        Status
                      </div>
                      <DropdownMenuRadioGroup
                        value={todoHistoryFilter}
                        onValueChange={(value) => {
                          if (
                            value === "ongoing" ||
                            value === "today" ||
                            value === "last7" ||
                            value === "last30"
                          ) {
                            setTodoHistoryFilter(value);
                          }
                        }}
                      >
                        {TODO_HISTORY_FILTER_OPTIONS.map((option) => (
                          <DropdownMenuRadioItem
                            key={option}
                            value={option}
                            label={TODO_HISTORY_FILTER_LABELS[option]}
                          />
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <SearchInput
                  name="todo-search"
                  value={todoSearchText}
                  onChange={setTodoSearchText}
                  placeholder="Search tasks..."
                  className="w-full"
                />
              </div>
              {hasDisplayedTodoItems ? (
                hasVisibleTodoItems ? (
                  visibleParticipantTodoLists.map((list) => {
                    const visibleItems = list.items;
                    if (visibleItems.length === 0) {
                      return null;
                    }
                    const visibleItemsToRender = visibleItems.filter(
                      (item) =>
                        !deletedTodoItemKeys.has(
                          getSummaryItemKey("needAttention", item)
                        )
                    );
                    const participantTodoSuggestions =
                      participantTodoSuggestionsByUserId[list.user.id] ?? [];

                    return (
                      <div key={list.user.id} className="flex flex-col gap-3">
                        {podVariant !== "personal" && (
                          <div className="flex items-center gap-3">
                            <Avatar
                              name={list.user.fullName}
                              visual={list.user.portrait}
                              size="xs"
                              isRounded={true}
                            />
                            <div className="flex flex-col">
                              <h4 className="heading-base text-muted-foreground">
                                {list.user.fullName}
                              </h4>
                            </div>
                          </div>
                        )}
                        {participantTodoSuggestions.length > 0 && (
                          <SuggestionBox
                            status="ready"
                            workingLabel="Creating suggested tasks..."
                            title="Suggestions"
                            items={participantTodoSuggestions.map(
                              (suggestion) => ({
                                id: suggestion.id,
                                text: suggestion.text,
                              })
                            )}
                            textById={participantTodoSuggestionTextById}
                            acceptItemLabel="Add this task"
                            onTextChange={(id, text) => {
                              setParticipantTodoSuggestionTextById(
                                (previousTextById) => ({
                                  ...previousTextById,
                                  [id]: text,
                                })
                              );
                            }}
                            onAcceptItem={(id) => {
                              const suggestion =
                                participantTodoSuggestions.find(
                                  (item) => item.id === id
                                );
                              if (suggestion) {
                                acceptParticipantTodoSuggestion(suggestion);
                              }
                            }}
                            onAcceptAll={() => {
                              participantTodoSuggestions.forEach(
                                acceptParticipantTodoSuggestion
                              );
                            }}
                            onRejectAll={() => {
                              participantTodoSuggestions.forEach(
                                rejectParticipantTodoSuggestion
                              );
                            }}
                          />
                        )}
                        <div
                          className={cn(
                            "flex flex-col gap-2",
                            podVariant !== "personal" && "pl-4"
                          )}
                        >
                          {visibleItemsToRender.map((item) => {
                            const itemKey = getSummaryItemKey(
                              "needAttention",
                              item
                            );
                            const todoItemText =
                              todoItemTextByKey[itemKey] ?? item.text;
                            const itemDiff = summaryItemDiffByKey[itemKey];
                            const isClosedHistoryItem =
                              closedTodoItemKeys.has(itemKey);
                            const isChecked =
                              isClosedHistoryItem ||
                              (checkedSummaryItems[itemKey] ?? false);
                            const relatedConversationIds =
                              summaryRelatedConversations[itemKey] ?? [];
                            const isAdded = itemDiff === "added";
                            const hasEntered = enteringItemKeys.has(itemKey);
                            const isExiting = exitingItemKeys.has(itemKey);
                            const shouldTypeChecklistItem =
                              typingItemKeys.has(itemKey) &&
                              itemDiff === "modified";
                            const autoCheckRationale =
                              autoCheckRationaleByKey[itemKey];
                            const isEditingTodoItem =
                              editingTodoItemKey === itemKey;

                            return (
                              <TaskItem
                                key={itemKey}
                                id={itemKey}
                                text={todoItemText}
                                isEditable={!isClosedHistoryItem}
                                isChecked={isChecked}
                                isDisabled={isClosedHistoryItem}
                                isEditing={isEditingTodoItem}
                                isMutedAfterCheck
                                className={cn(
                                  "w-full overflow-hidden pl-6 py-1",
                                  "transition-all duration-200",
                                  isExiting
                                    ? "max-h-0 opacity-0"
                                    : isAdded && !hasEntered
                                      ? "max-h-0 opacity-0"
                                      : "max-h-32 opacity-100"
                                )}
                                renderText={
                                  shouldTypeChecklistItem ? (
                                    <TypingAnimation
                                      key={`${itemKey}-${typingVersion}`}
                                      text={todoItemText}
                                      duration={16}
                                    />
                                  ) : undefined
                                }
                                autoCheckRationale={autoCheckRationale}
                                relatedConversations={relatedConversationIds.map(
                                  (conversationId) => ({
                                    id: conversationId,
                                    label:
                                      conversationTitleById.get(
                                        conversationId
                                      ) ?? conversationId,
                                  })
                                )}
                                editorRef={(node) => {
                                  if (node) {
                                    todoItemEditorRefs.current.set(
                                      itemKey,
                                      node
                                    );
                                  } else {
                                    todoItemEditorRefs.current.delete(itemKey);
                                  }
                                }}
                                onCheckedChange={(checked) => {
                                  if (isClosedHistoryItem) {
                                    return;
                                  }
                                  setCheckedSummaryItems((previous) => ({
                                    ...previous,
                                    [itemKey]: checked,
                                  }));
                                }}
                                onEditingChange={(isEditing) => {
                                  setEditingTodoItemKey((previousKey) => {
                                    if (isEditing) {
                                      return itemKey;
                                    }
                                    return previousKey === itemKey
                                      ? null
                                      : previousKey;
                                  });
                                }}
                                onCommit={(nextText) => {
                                  saveTodoItemText(
                                    itemKey,
                                    item.text,
                                    nextText
                                  );
                                }}
                                onRemove={() => removeTodoItem(itemKey)}
                                onAddAfter={() =>
                                  addDraftTodoItemAfter(list.user.id, itemKey)
                                }
                                onRelatedConversationClick={
                                  scrollToConversationRow
                                }
                                actions={
                                  <>
                                    <DropdownMenu
                                      onOpenChange={(open) => {
                                        if (!open) {
                                          setTodoReassignSearchText("");
                                        }
                                      }}
                                    >
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          icon={DotsHorizontal}
                                          size="xs"
                                          variant="ghost"
                                          tooltip="More actions"
                                          aria-label="More actions"
                                        />
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                          label="Delete"
                                          icon={Trash01}
                                          variant="warning"
                                        />
                                        <DropdownMenuSub>
                                          <DropdownMenuSubTrigger label="Re-assign to" />
                                          <DropdownMenuSubContent
                                            className="w-64"
                                            dropdownHeaders={
                                              <DropdownMenuSearchbar
                                                placeholder="Search participants"
                                                name="todo-reassign-search"
                                                value={todoReassignSearchText}
                                                onChange={
                                                  setTodoReassignSearchText
                                                }
                                                autoFocus
                                              />
                                            }
                                          >
                                            {reassignTodoParticipants.length >
                                            0 ? (
                                              reassignTodoParticipants.map(
                                                (participant) => (
                                                  <DropdownMenuItem
                                                    key={participant.id}
                                                    label={participant.fullName}
                                                    icon={
                                                      <Avatar
                                                        name={
                                                          participant.fullName
                                                        }
                                                        visual={
                                                          participant.portrait
                                                        }
                                                        size="xs"
                                                        isRounded={true}
                                                      />
                                                    }
                                                  />
                                                )
                                              )
                                            ) : (
                                              <DropdownMenuItem
                                                label="No participants found"
                                                disabled
                                              />
                                            )}
                                          </DropdownMenuSubContent>
                                        </DropdownMenuSub>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                    <Button
                                      icon={ArrowRight}
                                      size="xs"
                                      variant="highlight"
                                      tooltip="Start working on task"
                                      aria-label="Start task"
                                      onClick={() => {
                                        setActiveTaskCommand({
                                          id: itemKey,
                                          label: todoItemText,
                                          contextAttachments:
                                            relatedConversationIds.map(
                                              (conversationId) => ({
                                                id: conversationId,
                                                label:
                                                  conversationTitleById.get(
                                                    conversationId
                                                  ) ?? conversationId,
                                                tooltip: "Conversation context",
                                                visual: MessageChatSquare,
                                              })
                                            ),
                                        });
                                      }}
                                    />
                                  </>
                                }
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-base text-faint italic">
                    No tasks match your filters.
                  </div>
                )
              ) : isShowingTodoSuggestions ? null : (
                <div className="flex flex-col items-center gap-0 text-center">
                  <h3 className="heading-lg text-foreground">
                    No pending Tasks
                  </h3>
                  <p className="text-muted-foreground textbase">
                    You're all good.
                  </p>
                </div>
              )}
            </div>
          ) : isShowingTodoSuggestions ? null : (
            <ProjectSetupEmptyState onSetupProject={handleSetupProject} />
          )}
        </GroupConversationTabContent>

        {/* Files Tab */}
        <GroupConversationTabContent value="knowledge" contentClassName="gap-3">
          <FilesBrowser
            dataSources={dataSources}
            searchText={knowledgeSearchText}
            onSearchTextChange={setKnowledgeSearchText}
            currentFolderId={currentFolderId}
            onCurrentFolderIdChange={setCurrentFolderId}
            revealedFileId={revealedFileIdInKnowledge}
            onClearRevealedFile={() => setRevealedFileIdInKnowledge(null)}
            emptyMessage="No files in this room yet."
            onAddFileToTopbar={onAddFileToTopbar}
            onFileOpen={(dataSource) => {
              if (onFileOpen) {
                onFileOpen(dataSource);
              } else {
                setSelectedDataSource(dataSource);
                setIsDocumentSheetOpen(true);
              }
            }}
            onDeleteFile={(fileId) =>
              setDataSources((prev) => prev.filter((ds) => ds.id !== fileId))
            }
            dnd={{
              draggingFileId,
              dropHoverTargetId,
              onDragOverTarget: handleDragOverTarget,
              onDropOnTarget: handleDropOnTarget,
              onFileDragStart: handleFileDragStart,
              onFileDragEnd: handleFileDragEnd,
            }}
          />
        </GroupConversationTabContent>

        {dynamicFileTabIds.map((dataSourceId) => {
          const dataSource = dataSources.find(
            (item) => item.id === dataSourceId
          );
          if (!dataSource) {
            return null;
          }

          return (
            <GroupConversationTabContent
              key={dataSourceId}
              value={`file-${dataSourceId}`}
              fullBleed
            >
              <FilePreviewPanel dataSource={dataSource} variant="document" />
            </GroupConversationTabContent>
          );
        })}

        {/* About Tab */}
        {showToolsAndAboutTabs && (
          <GroupConversationTabContent value="about" contentClassName="gap-4">
            <p className="text-foreground">{space.description}</p>
          </GroupConversationTabContent>
        )}

        {/* Settings Tab */}
        <GroupConversationTabContent value="settings" contentClassName="gap-8">
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" icon={DotsHorizontal} />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {isProjectArchived ? (
                  <DropdownMenuItem
                    icon={Upload01}
                    label="Unarchive project"
                    onClick={handleUnarchiveProject}
                  />
                ) : (
                  <DropdownMenuItem
                    icon={Archive}
                    label="Archive project"
                    variant="warning"
                    onClick={handleArchiveProject}
                  />
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {isProjectArchived && (
            <ContentMessage variant="info" size="lg">
              This project has been archived.
            </ContentMessage>
          )}
          <div className="flex w-full flex-col gap-2">
            <h3 className="heading-lg">Name</h3>
            <div className="flex w-full min-w-0 gap-2">
              <Input
                value={roomName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setRoomName(e.target.value);
                  setIsEditingName(e.target.value !== space.name);
                }}
                placeholder="Enter room name"
                containerClassName="flex-1"
                className="has-[input:not(:placeholder-shown)]:border-border-form [&:has(input:not(:placeholder-shown)):not(:focus-within)]:bg-background"
              />
              {isEditingName && (
                <>
                  <Button
                    label="Save"
                    variant="highlight"
                    onClick={() => setShowNameSaveDialog(true)}
                  />
                  <Button
                    label="Cancel"
                    variant="outline"
                    onClick={() => {
                      setRoomName(space.name);
                      setIsEditingName(false);
                    }}
                  />
                </>
              )}
            </div>
          </div>
          <div className="flex w-full flex-col gap-2">
            <h3 className="heading-lg">Description</h3>
            <div className="flex w-full min-w-0 gap-2">
              <Input
                value={roomDescription}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setRoomDescription(e.target.value);
                  setIsEditingDescription(
                    e.target.value !== (space.description ?? "")
                  );
                }}
                placeholder="Enter room description"
                containerClassName="flex-1"
                className="has-[input:not(:placeholder-shown)]:border-border-form [&:has(input:not(:placeholder-shown)):not(:focus-within)]:bg-background"
              />
              {isEditingDescription && (
                <>
                  <Button
                    label="Save"
                    variant="highlight"
                    onClick={() => {
                      setIsEditingDescription(false);
                    }}
                  />
                  <Button
                    label="Cancel"
                    variant="outline"
                    onClick={() => {
                      setRoomDescription(space.description ?? "");
                      setIsEditingDescription(false);
                    }}
                  />
                </>
              )}
            </div>
          </div>
          {/* Open to Everyone Section */}

          <div className="flex w-full flex-col gap-2">
            <h3 className="heading-lg">Visibility</h3>
            <div className="flex items-start items-center justify-between gap-4 border-y py-4">
              <div className="flex flex-col">
                <div className="heading-sm text-foreground">
                  Opened to everyone
                </div>
                <div className="text-sm text-muted-foreground">
                  Anyone in the workspace can find and join the room.
                </div>
              </div>
              <SliderToggle
                selected={isPublic}
                onClick={() => {
                  const nextValue = !isPublic;
                  setShowPublicToggleDialog(true);
                  // Store the intended new value temporarily
                  setPendingPublicValue(nextValue);
                }}
              />
            </div>
          </div>
          {podTabCustomization && (
            <PodCustomizationSection
              tabs={podTabCustomization.tabs}
              addableFiles={podTabCustomization.addableFiles}
              onReorder={podTabCustomization.onReorder}
              onChangeIcon={podTabCustomization.onChangeIcon}
              onRemove={podTabCustomization.onRemove}
              onAdd={podTabCustomization.onAdd}
            />
          )}
          {/* Members Section */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="heading-lg flex-1">Members & Editors</h3>
              <Button
                label="Manage"
                variant="outline"
                icon={Users01}
                onClick={() => onInviteMembers?.()}
              />
            </div>
            {members.length === 0 ? (
              <EmptyCTA
                message="Feeling lonely? Invite participants!."
                action={
                  <EmptyCTAButton
                    icon={Users01}
                    label="Invite"
                    onClick={() => onInviteMembers?.()}
                  />
                }
              />
            ) : (
              <>
                <SearchInput
                  name="members-search"
                  value={membersSearchText}
                  onChange={setMembersSearchText}
                  placeholder="Search members..."
                  className="w-full"
                />
                <DataTable
                  columns={memberColumns}
                  data={filteredMembers}
                  sorting={[{ id: "name", desc: false }]}
                />
              </>
            )}
          </div>

          <div className="flex w-full flex-col gap-8 border-t pt-8">
            <div className="flex w-full flex-col gap-3">
              <h3 className="heading-lg">Danger Zone</h3>
              <h4 className="heading-base">Archive</h4>
              {!isProjectArchived && (
                <p className="text-sm text-muted-foreground">
                  This project will be removed from the sidebar. Its data stays
                  intact and can still be used as a data source.
                </p>
              )}
              {isProjectArchived ? (
                <div className="flex flex-col gap-3">
                  {archivedAt && archivedByName && (
                    <p className="text-sm text-foreground">
                      Archived on{" "}
                      <span className="font-medium">
                        {formatDate(archivedAt)} ·{" "}
                        {archivedAt.toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>{" "}
                      by <span className="font-medium">{archivedByName}</span>.
                    </p>
                  )}
                  <div className="flex w-full flex-col items-start">
                    <Button
                      icon={Upload01}
                      variant="outline"
                      label="Unarchive"
                      onClick={handleUnarchiveProject}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex w-full flex-col items-start">
                  <Button
                    icon={Archive}
                    variant="warning-secondary"
                    label="Archive"
                    onClick={handleArchiveProject}
                  />
                </div>
              )}
              <h4 className="heading-base">Delete</h4>
              <p className="text-sm text-muted-foreground">
                {`This permanently removes all content—conversations, folders, websites, and data sources. Assistants using this project's tools will be impacted. This cannot be undone.`}
              </p>
              <div className="flex w-full flex-col items-start">
                <Button
                  icon={Trash01}
                  variant="warning"
                  label="Delete project"
                  onClick={() => setShowDeleteProjectDialog(true)}
                />
              </div>
            </div>
          </div>
        </GroupConversationTabContent>
      </Tabs>

      {activeTaskCommand && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setActiveTaskCommand(null)}
        >
          <div
            className="w-full max-w-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <InputBar
              placeholder="Ask Dust to work on this task"
              variant="embedded"
              taskCommand={activeTaskCommand}
              className="rounded-2xl shadow-lg"
              onClose={() => setActiveTaskCommand(null)}
              onSend={() => setActiveTaskCommand(null)}
            />
          </div>
        </div>
      )}

      {/* Confirmation Dialogs */}
      {/* Name Save Dialog */}
      <Dialog
        open={showNameSaveDialog}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setShowNameSaveDialog(false);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Change name to "{roomName}"?</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            This updates the name for everyone and may impact Agents set to post
            here.
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setShowNameSaveDialog(false),
            }}
            rightButtonProps={{
              label: "Rename",
              variant: "warning",
              onClick: handleNameSaveConfirm,
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete project (playground mockup) */}
      <Dialog
        open={showDeleteProjectDialog}
        onOpenChange={(open: boolean) => {
          setShowDeleteProjectDialog(open);
          if (!open) {
            setDeleteConfirmDraft("");
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Delete {space.name}?</DialogTitle>
          </DialogHeader>
          <DialogContainer className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Type <span className="font-semibold text-foreground">delete</span>{" "}
              below to confirm. This permanently removes all project content and
              cannot be undone.
            </p>
            <Input
              name="delete-confirm"
              value={deleteConfirmDraft}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDeleteConfirmDraft(e.target.value)
              }
              placeholder="Type delete to confirm"
              containerClassName="w-full"
            />
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => {
                setShowDeleteProjectDialog(false);
                setDeleteConfirmDraft("");
              },
            }}
            rightButtonProps={{
              label: "Delete permanently",
              variant: "warning",
              disabled: deleteConfirmDraft.trim().toLowerCase() !== "delete",
              onClick: () => {
                setShowDeleteProjectDialog(false);
                setDeleteConfirmDraft("");
              },
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Public Toggle Dialog */}
      <Dialog
        open={showPublicToggleDialog}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setShowPublicToggleDialog(false);
            setPendingPublicValue(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              {pendingPublicValue === true
                ? "Switch to public?"
                : "Switch to restricted?"}
            </DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {pendingPublicValue === true
              ? "Everyone in the workspace will be able to see and join this room."
              : "Access will be limited to invited members only."}
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => {
                setShowPublicToggleDialog(false);
                setPendingPublicValue(null);
              },
            }}
            rightButtonProps={{
              label: "Confirm",
              variant: "warning",
              onClick: handlePublicToggleConfirm,
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Remove Member Dialog */}
      <Dialog
        open={removeMemberDialogOpen}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setRemoveMemberDialogOpen(false);
            setSelectedMemberIdToRemove(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Remove member from room?</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {selectedMemberIdToRemove && (
              <div>
                Are you sure you want to remove "
                {getUserById(selectedMemberIdToRemove)?.fullName ||
                  "this member"}
                " from this room?
              </div>
            )}
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => {
                setRemoveMemberDialogOpen(false);
                setSelectedMemberIdToRemove(null);
              },
            }}
            rightButtonProps={{
              label: "Remove",
              variant: "warning",
              onClick: handleRemoveMemberConfirm,
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Document View Sheet */}
      <Sheet
        open={isDocumentSheetOpen}
        onOpenChange={(open: boolean) => {
          setIsDocumentSheetOpen(open);
          if (!open) {
            setSelectedDataSource(null);
            setIsFrameFullscreen(false);
          }
        }}
      >
        <SheetContent
          size="3xl"
          side="right"
          className={cn(
            selectedDataSource?.fileType === "frame" &&
              isFrameFullscreen &&
              "inset-0 sm:max-w-none"
          )}
          onEscapeKeyDown={(event) => {
            if (selectedDataSource?.fileType === "frame" && isFrameFullscreen) {
              event.preventDefault();
              setIsFrameFullscreen(false);
            }
          }}
        >
          {selectedDataSource?.fileType === "frame" ? (
            <>
              <FrameSheetHeader
                title={selectedDataSource.fileName}
                isFullscreen={isFrameFullscreen}
                isPinnedAsBanner={pinnedBannerFileId === selectedDataSource.id}
                onToggleFullscreen={() =>
                  setIsFrameFullscreen((previous) => !previous)
                }
                onAddToTopBar={
                  onAddFileToTopbar
                    ? () => onAddFileToTopbar(selectedDataSource.id)
                    : undefined
                }
                onAddAsBanner={() =>
                  setPinnedBannerFileId((previous) =>
                    previous === selectedDataSource.id
                      ? null
                      : selectedDataSource.id
                  )
                }
              />
              <SheetContainer isListSelector noScroll>
                <FilePreviewPanel
                  dataSource={selectedDataSource}
                  variant="document"
                />
              </SheetContainer>
            </>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle>
                  {selectedDataSource?.fileName ?? "File"}
                </SheetTitle>
              </SheetHeader>
              <SheetContainer isListSelector noScroll>
                {selectedDataSource ? (
                  <FilePreviewPanel
                    dataSource={selectedDataSource}
                    variant="document"
                  />
                ) : null}
              </SheetContainer>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Member Detail Sheet */}
      <Sheet
        open={isMemberSheetOpen}
        onOpenChange={(open: boolean) => {
          setIsMemberSheetOpen(open);
          if (!open) {
            setSelectedMember(null);
          }
        }}
      >
        <SheetContent size="lg" side="right">
          <SheetHeader>
            <SheetTitle>
              {selectedMember?.fullName || "Member detailview"}
            </SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-foreground">Member detailview</p>
            </div>
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}
