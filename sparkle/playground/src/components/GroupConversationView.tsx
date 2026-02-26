import {
  ArrowDownOnSquareIcon,
  ArrowUpOnSquareIcon,
  Avatar,
  BookOpenIcon,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Card,
  CardGrid,
  ChatBubbleLeftRightIcon,
  CheckDoubleIcon,
  CheckIcon,
  Checkbox,
  CircleIcon,
  Chip,
  Cog6ToothIcon,
  ConversationListItem,
  DataTable,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyCTA,
  EmptyCTAButton,
  ExternalLinkIcon,
  Icon,
  InformationCircleIcon,
  Input,
  ListGroup,
  ListItemSection,
  LogoutIcon,
  MagicIcon,
  MoreIcon,
  ReplySection,
  SearchInput,
  SearchInputWithPopover,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SliderToggle,
  SquareIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  ToolsIcon,
  TrashIcon,
  TriangleIcon,
  TypingAnimation,
  UserGroupIcon,
  XMarkIcon,
  WindIcon,
} from "@dust-tt/sparkle";
import { UniversalSearchItem } from "@dust-tt/sparkle/components/UniversalSearchItem";
import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "@sparkle/lib/utils";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { getAgentById } from "../data/agents";
import { getDataSourcesBySpaceId } from "../data/dataSources";
import type {
  Agent,
  Conversation,
  DataSource,
  Space,
  User,
} from "../data/types";
import { getUserById } from "../data/users";
import { InputBar } from "./InputBar";
import { WhatsNewDeltaList } from "./WhatsNewDeltaList";

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

  // Shuffle and select 1-6 participants
  const shuffled = [...allParticipants].sort(() => Math.random() - 0.5);
  const count = Math.min(
    Math.max(1, Math.floor(Math.random() * 6) + 1),
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
      Math.floor(Math.random() * conversation.userParticipants.length)
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

// Helper function to generate more conversations with varied dates
function generateConversationsWithDates(
  conversations: Conversation[],
  count: number
): Conversation[] {
  const now = new Date();
  const generated: Conversation[] = [];

  // Duplicate and vary existing conversations
  for (let i = 0; i < count; i++) {
    const baseConversation = conversations[i % conversations.length];
    const daysAgo = Math.floor(Math.random() * 35); // Up to 35 days ago
    const hoursAgo = Math.floor(Math.random() * 24);
    const minutesAgo = Math.floor(Math.random() * 60);

    const updatedAt = new Date(now);
    updatedAt.setDate(updatedAt.getDate() - daysAgo);
    updatedAt.setHours(updatedAt.getHours() - hoursAgo);
    updatedAt.setMinutes(updatedAt.getMinutes() - minutesAgo);

    const createdAt = new Date(updatedAt);
    createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 5));

    generated.push({
      ...baseConversation,
      id: `${baseConversation.id}-${i}`,
      updatedAt,
      createdAt,
      title: baseConversation.title,
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
      <span key={`${matchedName}-${matchIndex}`} className="s-font-semibold">
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
}: GroupConversationViewProps) {
  const [searchText, setSearchText] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [ongoingSummary, setOngoingSummary] = useState<OngoingSummary | null>(
    null
  );
  const [isSummaryUpdating, setIsSummaryUpdating] = useState(false);
  const [isOngoingSummaryExpanded, setIsOngoingSummaryExpanded] =
    useState(false);
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

  // Active tab (for switching from suggestion cards)
  const [activeTab, setActiveTab] = useState("conversations");

  // Knowledge tab state
  const [dataSources, setDataSources] = useState<DataSource[]>(() =>
    getDataSourcesBySpaceId(space.id)
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDataSourceId, setSelectedDataSourceId] = useState<
    string | null
  >(null);
  const [knowledgeSearchText, setKnowledgeSearchText] = useState("");
  const [selectedDataSource, setSelectedDataSource] =
    useState<DataSource | null>(null);
  const [isDocumentSheetOpen, setIsDocumentSheetOpen] = useState(false);
  const [documentView, setDocumentView] = useState<"preview" | "extracted">(
    "preview"
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
    return generateConversationsWithDates(conversations, targetCount);
  }, [conversations, space.id]);

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

    const conversationResults = expandedConversations.reduce<
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
  }, [dataSources, expandedConversations, searchText, users]);

  const handleSearchItemSelect = (item: UniversalSearchItem) => {
    if (item.type === "document") {
      setSelectedDataSource(item.dataSource);
      setIsDocumentSheetOpen(true);
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
        <span className="s-shrink-0">{titlePrefix}</span>
        <span className="s-min-w-0 s-truncate s-text-muted-foreground dark:s-text-muted-foreground-night">
          {item.title}
        </span>
      </>
    ) : (
      <span className="s-min-w-0 s-truncate">{item.title}</span>
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

    expandedConversations.forEach((conversation) => {
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
  }, [expandedConversations]);

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
  const SUMMARY_COLLAPSED_MAX_HEIGHT_PX = 260;

  const conversationTitleById = useMemo(() => {
    const titleMap = new Map<string, string>();
    expandedConversations.forEach((conversation) => {
      titleMap.set(conversation.id, conversation.title);
    });
    return titleMap;
  }, [expandedConversations]);

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
          <span key={`${item.id}-link-${index}`} className="s-underline">
            {segment.text}
          </span>
        );
      }

      return (
        <button
          key={`${item.id}-link-${index}`}
          type="button"
          className="s-underline hover:s-no-underline"
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

  // Reset room name when space changes
  useEffect(() => {
    setRoomName(space.name);
    setIsEditingName(false);
    setRoomDescription(space.description ?? "");
    setIsEditingDescription(false);
    setEditorIds(editorUserIds);
    setIsPublic(spacePublicSettings?.get(space.id) ?? space.isPublic ?? true);
  }, [space.id, space.name, spacePublicSettings, space.isPublic]);

  useEffect(() => {
    setEditorIds(editorUserIds);
  }, [editorUserIds]);

  useEffect(() => {
    if (!hasHistory) {
      setOngoingSummary(null);
      setIsSummaryUpdating(false);
      setIsOngoingSummaryExpanded(false);
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
    setIsOngoingSummaryExpanded(false);
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
  }, [space.id]);

  // Transform data sources to include onClick handlers
  const dataSourcesWithClick = useMemo(() => {
    return dataSources.map((ds) => ({
      ...ds,
      onClick: () => {
        setSelectedDataSource(ds);
        setIsDocumentSheetOpen(true);
      },
    }));
  }, [dataSources]);

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

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    if (selectedDataSourceId) {
      setDataSources((prev) =>
        prev.filter((ds) => ds.id !== selectedDataSourceId)
      );
      setSelectedDataSourceId(null);
    }
    setDeleteDialogOpen(false);
  };

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

  // Create table columns
  const columns: ColumnDef<DataSource & { onClick?: () => void }>[] = useMemo(
    () => [
      {
        accessorKey: "fileName",
        header: "File name",
        id: "fileName",
        sortingFn: "text",
        meta: {
          className: "s-w-full",
        },
        cell: (info) => (
          <DataTable.CellContent>
            <div className="s-flex s-items-center s-gap-2">
              {info.row.original.icon && (
                <Icon visual={info.row.original.icon} size="sm" />
              )}
              <span>{info.getValue() as string}</span>
            </div>
          </DataTable.CellContent>
        ),
      },
      {
        accessorKey: "createdBy",
        header: "Created by",
        id: "createdBy",
        meta: {
          className: "s-w-[180px]",
        },
        cell: (info) => {
          const userId = info.getValue() as string;
          const user = getUserById(userId);
          if (!user) return <DataTable.BasicCellContent label="Unknown" />;
          return (
            <DataTable.CellContent>
              <div className="s-flex s-items-center s-gap-2">
                <Avatar
                  name={user.fullName}
                  visual={user.portrait}
                  size="xs"
                  isRounded={true}
                />
                <span className="s-text-sm">{user.fullName}</span>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        accessorKey: "updatedAt",
        header: "Last Updated",
        id: "lastUpdated",
        meta: {
          className: "s-w-[140px]",
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
          className: "s-w-12",
        },
        cell: (info) => (
          <DataTable.MoreButton
            menuItems={[
              {
                kind: "item",
                label: "Delete",
                icon: TrashIcon,
                variant: "warning",
                onClick: () => {
                  setSelectedDataSourceId(info.row.original.id);
                  setDeleteDialogOpen(true);
                },
              },
            ]}
          />
        ),
      },
    ],
    []
  );

  // Create member table columns
  const memberColumns: ColumnDef<Member>[] = useMemo(
    () => [
      {
        accessorKey: "userId",
        header: "Name",
        id: "name",
        sortingFn: "text",
        meta: {
          className: "s-w-full",
        },
        cell: (info) => {
          const userId = info.getValue() as string;
          const user = getUserById(userId);
          if (!user) return <DataTable.BasicCellContent label="Unknown" />;
          return (
            <DataTable.CellContent>
              <div className="s-flex s-items-center s-gap-2">
                <Avatar
                  name={user.fullName}
                  visual={user.portrait}
                  size="xs"
                  isRounded={true}
                />
                <span className="s-text-sm">{user.fullName}</span>
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
          className: "s-w-[200px]",
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
          className: "s-w-[120px]",
        },
        cell: (info) => {
          const userId = info.getValue() as string;
          return editorIds.includes(userId) ? (
            <DataTable.CellContent>
              <Chip size="xs" color="green" label="editor" />
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
          className: "s-w-[140px]",
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
          className: "s-w-12",
        },
        cell: (info) => (
          <DataTable.MoreButton
            menuItems={[
              {
                kind: "item",
                icon: editorIds.includes(info.row.original.userId)
                  ? XMarkIcon
                  : CheckIcon,
                label: editorIds.includes(info.row.original.userId)
                  ? "Remove from editors"
                  : "Set as editor",
                onClick: () => {
                  toggleMemberEditor(info.row.original.userId);
                },
              },
              {
                kind: "item",
                label: "Remove from Room",
                icon: TrashIcon,
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

  return (
    <div className="s-flex s-h-full s-w-full s-flex-col s-bg-background dark:s-bg-background-night">
      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="s-flex s-min-h-0 s-flex-1 s-flex-col"
      >
        <div className="s-flex s-h-14 s-w-full s-items-center s-gap-2 s-border-b s-border-border dark:s-border-border-night s-px-6">
          <div className="s-flex s-h-full s-flex-1 s-items-end">
            <TabsList border={false}>
              <TabsTrigger
                value="conversations"
                label="Conversations"
                icon={ChatBubbleLeftRightIcon}
              />
              <TabsTrigger
                value="knowledge"
                label="Knowledge"
                icon={BookOpenIcon}
              />
              {showToolsAndAboutTabs && (
                <>
                  <TabsTrigger value="Tools" label="Tools" icon={ToolsIcon} />
                  <TabsTrigger
                    value="about"
                    label="About"
                    icon={InformationCircleIcon}
                  />
                </>
              )}
              <TabsTrigger
                value="settings"
                icon={Cog6ToothIcon}
                tooltip={"Room settings"}
              />
            </TabsList>
          </div>
          <div className="s-flex-1" />
          {spaceAvatars.length > 0 && (
            <div className="s-flex s-h-8 s-items-center">
              <Avatar.Stack
                avatars={spaceAvatars}
                nbVisibleItems={spaceAvatars.length}
                orientation="horizontal"
                hasMagnifier={false}
                size="sm"
              />
            </div>
          )}
          {isProjectJoined ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={MoreIcon}
                  tooltip="Project options"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  label="Leave the project"
                  icon={LogoutIcon}
                  onClick={onLeaveProject}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              variant="primary"
              label="Join the project"
              tooltip="Join the project to be notified of new conversations"
              onClick={onJoinProject}
            />
          )}
        </div>

        {/* Conversations Tab */}
        <TabsContent value="conversations">
          <div className="s-flex s-h-full s-min-h-0 s-flex-1 s-flex-col s-overflow-y-auto s-px-6">
            <div
              className={`s-mx-auto s-flex s-w-full s-max-w-4xl s-flex-col s-gap-6 ${
                !hasHistory ? "s-h-full s-justify-center s-py-8" : "s-py-8"
              }`}
            >
              {/* New conversation section */}
              <div className="s-flex s-flex-col s-gap-3">
                <h2 className="s-heading-2xl s-text-foreground dark:s-text-foreground-night">
                  {space.name}
                </h2>

                {/* Suggestions for empty rooms */}
                {!hasHistory && (
                  <div className="s-flex s-flex-col s-gap-5">
                    <h3 className="s-heading-lg s-text-foreground dark:s-text-foreground-night">
                      Start a first conversation!
                    </h3>
                  </div>
                )}
                <InputBar
                  placeholder={`Start a conversation in ${space.name}`}
                />
                {hasHistory && (
                  <div className="s-flex s-w-full s-gap-2 s-px-4">
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
                      placeholder={`Search in ${space.name}`}
                      className="s-w-full"
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
                )}

                {!hasHistory && (
                  <div className="s-flex s-flex-col s-gap-3">
                    <h3 className="s-heading-lg s-text-foreground dark:s-text-foreground-night">
                      New Project? Let us help you setup.
                    </h3>
                    <CardGrid>
                      {[
                        {
                          id: "kickoff",
                          label: "Get your project running",
                          icon: MagicIcon,
                          variant: "highlight" as const,
                          description:
                            "Answer a few questions and an agent will fill in your project details.",
                          onClick: () => {},
                          isPulsing: true,
                        },
                        {
                          id: "add-knowledge",
                          label: "Add knowledge",
                          variant: "primary" as const,
                          icon: BookOpenIcon,
                          description:
                            "Add files, links, or data sources relevant to this project.",
                          onClick: () => setActiveTab("knowledge"),
                          isPulsing: false,
                        },
                        {
                          id: "invite-members",
                          label: "Manage members",
                          variant: "primary" as const,
                          icon: UserGroupIcon,
                          description:
                            "Invite people to this project as members or editors.",
                          onClick: () => onInviteMembers?.(),
                          isPulsing: false,
                        },
                      ].map((suggestion) => (
                        <Card
                          key={suggestion.id}
                          variant={suggestion.variant}
                          size="lg"
                          onClick={suggestion.onClick}
                          className="s-cursor-pointer"
                        >
                          <div className="s-flex s-w-full s-flex-col s-gap-2 s-text-sm">
                            <div
                              className={`s-flex s-w-full s-items-center s-gap-2 s-font-semibold ${
                                suggestion.variant === "highlight"
                                  ? "s-text-highlight-600 dark:s-text-highlight-400"
                                  : "s-text-foreground dark:s-text-foreground-night"
                              }`}
                            >
                              <Icon visual={suggestion.icon} size="sm" />
                              <div className="s-w-full">{suggestion.label}</div>
                            </div>
                            {suggestion.description && (
                              <div className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                                {suggestion.description}
                              </div>
                            )}
                          </div>
                        </Card>
                      ))}
                    </CardGrid>
                  </div>
                )}
              </div>
              {hasHistory && ongoingSummary && (
                <div className="s-flex s-flex-col s-gap-3">
                  <div className="s-inline-flex s-items-center s-gap-2 s-flex-wrap">
                    <h3 className="s-heading-2xl s-text-foreground dark:s-text-foreground-night">
                      What's new?
                    </h3>
                    <Tooltip
                      label={`Last updated ${formatSummaryUpdatedAt(ongoingSummary.updatedAt)}`}
                      trigger={
                        <Chip
                          size="xs"
                          color={isSummaryUpdating ? "highlight" : "primary"}
                          label={isSummaryUpdating ? "Updating" : "Just now"}
                          isBusy={isSummaryUpdating}
                        />
                      }
                    />
                    <div className="s-flex-1" />
                    <Button
                      size="xs"
                      variant="outline"
                      icon={WindIcon}
                      tooltip="Remove checked items"
                      label="Clean"
                      onClick={() => {
                        const checkedKeys = new Set(
                          Object.entries(checkedSummaryItems)
                            .filter(([, checked]) => checked)
                            .map(([key]) => key)
                        );

                        if (checkedKeys.size === 0) {
                          return;
                        }

                        const checkedKeysArray = Array.from(checkedKeys);
                        const exitingChecklistKeys = checkedKeysArray.filter(
                          (key) =>
                            key.startsWith("needAttention::") ||
                            key.startsWith("keyDecisions::")
                        );

                        setExitingItemKeys(
                          (previousExiting) =>
                            new Set([
                              ...previousExiting,
                              ...exitingChecklistKeys,
                            ])
                        );

                        if (cleanTransitionTimeoutRef.current !== null) {
                          window.clearTimeout(
                            cleanTransitionTimeoutRef.current
                          );
                        }

                        cleanTransitionTimeoutRef.current = window.setTimeout(
                          () => {
                            setOngoingSummary((previousSummary) => {
                              if (!previousSummary) {
                                return previousSummary;
                              }
                              const updatedSummary = {
                                ...previousSummary,
                                needAttention:
                                  previousSummary.needAttention.filter(
                                    (item) =>
                                      !checkedKeys.has(
                                        getSummaryItemKey("needAttention", item)
                                      )
                                  ),
                                keyDecisions:
                                  previousSummary.keyDecisions.filter(
                                    (item) =>
                                      !checkedKeys.has(
                                        getSummaryItemKey("keyDecisions", item)
                                      )
                                  ),
                                projectPulse:
                                  previousSummary.projectPulse.filter(
                                    (item) =>
                                      !checkedKeys.has(
                                        getSummaryItemKey("projectPulse", item)
                                      )
                                  ),
                              };
                              setSummaryRelatedConversations(
                                (previousLinks) => {
                                  const validKeys = new Set(
                                    getSummaryItemKeys(updatedSummary)
                                  );
                                  return Object.fromEntries(
                                    Object.entries(previousLinks).filter(
                                      ([key]) => validKeys.has(key)
                                    )
                                  );
                                }
                              );
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
                            setAutoCheckRationaleByKey(
                              (previousAutoCheckRationaleByKey) =>
                                Object.fromEntries(
                                  Object.entries(
                                    previousAutoCheckRationaleByKey
                                  ).filter(([key]) => !checkedKeys.has(key))
                                )
                            );
                            setTypingItemKeys((previousTypingItemKeys) => {
                              const nextTypingItemKeys = new Set(
                                previousTypingItemKeys
                              );
                              checkedKeysArray.forEach((key) =>
                                nextTypingItemKeys.delete(key)
                              );
                              return nextTypingItemKeys;
                            });
                            setExitingItemKeys((previousExiting) => {
                              const nextExiting = new Set(previousExiting);
                              exitingChecklistKeys.forEach((key) =>
                                nextExiting.delete(key)
                              );
                              return nextExiting;
                            });
                            cleanTransitionTimeoutRef.current = null;
                          },
                          SUMMARY_ITEM_TRANSITION_MS
                        );
                      }}
                    />
                  </div>

                  <div className="s-relative">
                    <div
                      className="s-flex s-flex-col s-gap-4"
                      style={{
                        maxHeight: isOngoingSummaryExpanded
                          ? 2000
                          : SUMMARY_COLLAPSED_MAX_HEIGHT_PX,
                        overflow: "hidden",
                        transition: "max-height 200ms ease",
                      }}
                    >
                      {ongoingSummary.needAttention.length +
                        ongoingSummary.keyDecisions.length +
                        ongoingSummary.projectPulse.length >
                      0 ? (
                        <>
                          {[
                            {
                              key: "needAttention",
                              summaryCategory: "needAttention" as const,
                              icon: TriangleIcon,
                              iconClassName:
                                "s-text-warning-300 dark:s-text-warning-300-night",
                              label: "Need to do",
                              items: ongoingSummary.needAttention,
                            },
                            {
                              key: "needKnow",
                              summaryCategory: "keyDecisions" as const,
                              icon: SquareIcon,
                              iconClassName:
                                "s-text-golden-300 dark:s-text-golden-300-night",
                              label: "Need to know",
                              items: ongoingSummary.keyDecisions,
                            },
                          ]
                            .filter((section) => section.items.length > 0)
                            .map((section) => (
                              <WhatsNewDeltaList
                                key={section.key}
                                label={section.label}
                                summaryCategory={section.summaryCategory}
                                icon={section.icon}
                                iconClassName={section.iconClassName}
                                items={section.items}
                                checkedSummaryItems={checkedSummaryItems}
                                summaryRelatedConversations={
                                  summaryRelatedConversations
                                }
                                summaryItemDiffByKey={summaryItemDiffByKey}
                                typingItemKeys={typingItemKeys}
                                enteringItemKeys={enteringItemKeys}
                                exitingItemKeys={exitingItemKeys}
                                typingVersion={typingVersion}
                                getSummaryItemKey={getSummaryItemKey}
                                renderSummaryItemText={
                                  renderSummaryItemWithEmphasizedNames
                                }
                                onCheckItem={(itemKey, nextChecked) => {
                                  setCheckedSummaryItems((previous) => ({
                                    ...previous,
                                    [itemKey]: nextChecked,
                                  }));
                                }}
                                onCheckSection={(sectionItemKeys) => {
                                  setCheckedSummaryItems((previous) => ({
                                    ...previous,
                                    ...Object.fromEntries(
                                      sectionItemKeys.map((key) => [key, true])
                                    ),
                                  }));
                                }}
                                onConversationClick={scrollToConversationRow}
                                conversationTitleById={conversationTitleById}
                                autoCheckRationaleByKey={
                                  autoCheckRationaleByKey
                                }
                              />
                            ))}

                          {ongoingSummary.projectPulse.length > 0 && (
                            <div className="s-flex s-flex-col s-gap-2">
                              <div className="s-group/summary-title s-flex s-items-center s-gap-3 s-pt-2">
                                <div className="s-flex s-items-center s-h-4 s-w-4">
                                  {(() => {
                                    const sectionItemKeys =
                                      ongoingSummary.projectPulse.map((item) =>
                                        getSummaryItemKey("projectPulse", item)
                                      );
                                    const areAllSectionItemsChecked =
                                      sectionItemKeys.length > 0 &&
                                      sectionItemKeys.every(
                                        (itemKey) =>
                                          checkedSummaryItems[itemKey]
                                      );

                                    return (
                                      <>
                                        <Icon
                                          visual={CircleIcon}
                                          size="xs"
                                          className={cn(
                                            "group-hover/summary-title:s-hidden",
                                            "s-text-green-300 dark:s-text-green-300-night"
                                          )}
                                        />
                                        <Checkbox
                                          size="xs"
                                          className="s-hidden group-hover/summary-title:s-inline-block"
                                          checked={areAllSectionItemsChecked}
                                          onCheckedChange={(checked) => {
                                            if (checked !== true) {
                                              return;
                                            }

                                            setCheckedSummaryItems(
                                              (previous) => ({
                                                ...previous,
                                                ...Object.fromEntries(
                                                  sectionItemKeys.map((key) => [
                                                    key,
                                                    true,
                                                  ])
                                                ),
                                              })
                                            );
                                          }}
                                        />
                                      </>
                                    );
                                  })()}
                                </div>
                                <h4 className="s-heading-lg s-text-foreground dark:s-text-foreground-night">
                                  Good to know
                                </h4>
                              </div>
                              <div
                                className={cn(
                                  "s-text-sm s-pl-7",
                                  ongoingSummary.projectPulse.every(
                                    (item) =>
                                      checkedSummaryItems[
                                        getSummaryItemKey("projectPulse", item)
                                      ]
                                  )
                                    ? "s-text-faint s-line-through dark:s-text-faint-night"
                                    : "s-text-muted-foreground dark:s-text-muted-foreground-night"
                                )}
                              >
                                {ongoingSummary.projectPulse.map(
                                  (item, index) => {
                                    const itemKey = getSummaryItemKey(
                                      "projectPulse",
                                      item
                                    );
                                    const relatedConversationIds =
                                      summaryRelatedConversations[itemKey] ??
                                      [];
                                    const isChecked =
                                      checkedSummaryItems[itemKey] ?? false;
                                    const shouldTypePulseItem =
                                      typingItemKeys.has(itemKey) &&
                                      (summaryItemDiffByKey[itemKey] ===
                                        "modified" ||
                                        summaryItemDiffByKey[itemKey] ===
                                          "added");

                                    return (
                                      <span key={itemKey}>
                                        {shouldTypePulseItem ? (
                                          <TypingAnimation
                                            key={`${itemKey}-${typingVersion}`}
                                            text={item.segments
                                              .map((segment) => segment.text)
                                              .join("")}
                                            duration={16}
                                          />
                                        ) : (
                                          renderProjectPulseItemWithInlineLinks(
                                            item,
                                            relatedConversationIds,
                                            isChecked
                                          )
                                        )}
                                        {index <
                                        ongoingSummary.projectPulse.length - 1
                                          ? " "
                                          : null}
                                      </span>
                                    );
                                  }
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="s-text-base s-text-faint s-italic dark:s-text-faint-night">
                          You're all catch up!
                        </div>
                      )}
                    </div>
                    {!isOngoingSummaryExpanded &&
                      ongoingSummary.needAttention.length +
                        ongoingSummary.keyDecisions.length +
                        ongoingSummary.projectPulse.length >
                        0 && (
                        <div className="s-pointer-events-none s-absolute s-bottom-0 s-left-0 s-right-0 s-h-10 s-bg-gradient-to-b s-from-transparent s-to-background dark:s-to-background-night" />
                      )}
                  </div>
                  {ongoingSummary.needAttention.length +
                    ongoingSummary.keyDecisions.length +
                    ongoingSummary.projectPulse.length >
                    0 && (
                    <div>
                      <Button
                        size="xs"
                        variant="outline"
                        label={
                          isOngoingSummaryExpanded ? "Show less" : "Show more"
                        }
                        onClick={() =>
                          setIsOngoingSummaryExpanded((previous) => !previous)
                        }
                        aria-expanded={isOngoingSummaryExpanded}
                      />
                    </div>
                  )}
                </div>
              )}
              {/* Conversations list */}
              <div className="s-flex s-flex-col s-gap-3">
                {expandedConversations.length > 0 && (
                  <>
                    <div className="s-flex s-flex-col">
                      {(
                        [
                          "Today",
                          "Yesterday",
                          "Last Week",
                          "Last Month",
                        ] as const
                      ).map((bucketKey) => {
                        const bucketConversations =
                          conversationsByBucket[bucketKey];
                        if (bucketConversations.length === 0) return null;

                        return (
                          <>
                            <ListItemSection>{bucketKey}</ListItemSection>
                            <ListGroup className="!s-border-transparent">
                              {bucketConversations.map((conversation) => {
                                const participants = getRandomParticipants(
                                  conversation,
                                  users,
                                  agents
                                );
                                const creator = getRandomCreator(
                                  conversation,
                                  users
                                );
                                const avatarProps =
                                  participantsToAvatarProps(participants);

                                // Format time from updatedAt
                                const time = conversation.updatedAt
                                  .toLocaleTimeString("en-US", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: false,
                                  })
                                  .replace("24:", "00:");

                                // Generate random counts respecting mentionCount <= unreadCount <= replyCount
                                const replyCount = Math.floor(
                                  Math.random() * 8 + 1
                                );
                                const messageCount = Math.floor(
                                  Math.random() * replyCount + 1
                                );
                                const mentionCount = Math.floor(
                                  Math.random() * (messageCount + 1)
                                );

                                const baseConversationId =
                                  getBaseConversationId(
                                    conversation,
                                    conversations
                                  );

                                const conversationForLookup = {
                                  ...conversation,
                                  id: baseConversationId,
                                };

                                return (
                                  <div
                                    id={getConversationRowDomId(
                                      conversation.id
                                    )}
                                    key={conversation.id}
                                  >
                                    <ConversationListItem
                                      conversation={conversation}
                                      creator={creator || undefined}
                                      time={time}
                                      showFocus={
                                        conversationIdToShowFocus ===
                                        conversation.id
                                      }
                                      replySection={
                                        <ReplySection
                                          replyCount={replyCount}
                                          unreadCount={
                                            bucketKey === "Today"
                                              ? messageCount
                                              : 0
                                          }
                                          mentionCount={
                                            bucketKey === "Today"
                                              ? mentionCount
                                              : 0
                                          }
                                          avatars={avatarProps}
                                          lastMessageBy={
                                            avatarProps[0]?.name || "Unknown"
                                          }
                                        />
                                      }
                                      onClick={() => {
                                        onConversationClick?.(
                                          conversationForLookup
                                        );
                                      }}
                                    />
                                  </div>
                                );
                              })}
                            </ListGroup>
                          </>
                        );
                      })}
                    </div>
                    <div className="s-flex s-flex-col s-gap-3 s-py-8">
                      <h3 className="s-heading-lg s-text-foreground dark:s-text-foreground-night">
                        Do more with your project!
                      </h3>
                      <CardGrid>
                        {[
                          {
                            id: "kickoff",
                            label: "Get your project running",
                            icon: MagicIcon,
                            variant: "highlight" as const,
                            description:
                              "Answer a few questions and an agent will fill in your project details.",
                            onClick: () => {},
                            isPulsing: true,
                          },
                          {
                            id: "add-knowledge",
                            label: "Add knowledge",
                            variant: "primary" as const,
                            icon: BookOpenIcon,
                            description:
                              "Add files, links, or data sources relevant to this project.",
                            onClick: () => setActiveTab("knowledge"),
                            isPulsing: false,
                          },
                          {
                            id: "invite-members",
                            label: "Manage members",
                            variant: "primary" as const,
                            icon: UserGroupIcon,
                            description:
                              "Invite people to this project as members or editors.",
                            onClick: () => onInviteMembers?.(),
                            isPulsing: false,
                          },
                        ].map((suggestion) => (
                          <Card
                            key={suggestion.id}
                            variant={suggestion.variant}
                            size="lg"
                            onClick={suggestion.onClick}
                            className="s-cursor-pointer"
                          >
                            <div className="s-flex s-w-full s-flex-col s-gap-2 s-text-base">
                              <div
                                className={`s-flex s-w-full s-items-center s-gap-2 s-font-semibold ${
                                  suggestion.variant === "highlight"
                                    ? "s-text-highlight-600 dark:s-text-highlight-400"
                                    : "s-text-foreground dark:s-text-foreground-night"
                                }`}
                              >
                                <Icon visual={suggestion.icon} size="sm" />
                                <div className="s-w-full">
                                  {suggestion.label}
                                </div>
                              </div>
                              {suggestion.description && (
                                <div className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                                  {suggestion.description}
                                </div>
                              )}
                            </div>
                          </Card>
                        ))}
                      </CardGrid>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Knowledge Tools Tab */}
        <TabsContent value="knowledge">
          <div className="s-flex s-h-full s-min-h-0 s-flex-1 s-flex-col s-overflow-y-auto s-px-6">
            <div className="s-mx-auto s-flex s-w-full s-flex-col s-gap-4 s-py-8">
              <div className="s-flex s-gap-2">
                <h3 className="s-heading-2xl s-flex-1 s-items-center">
                  Knowledge
                </h3>
                <Button
                  variant="outline"
                  icon={ArrowUpOnSquareIcon}
                  label="Add knowledge"
                />
              </div>
              {dataSources.length === 0 ? (
                <EmptyCTA
                  message="No knowledge files in this room yet."
                  action={
                    <EmptyCTAButton
                      icon={ArrowUpOnSquareIcon}
                      label="Add knowledge"
                    />
                  }
                />
              ) : (
                <>
                  <SearchInput
                    name="knowledge-search"
                    value={knowledgeSearchText}
                    onChange={setKnowledgeSearchText}
                    placeholder="Search files..."
                    className="s-w-full"
                  />
                  <DataTable
                    columns={columns}
                    data={dataSourcesWithClick}
                    filter={knowledgeSearchText}
                    filterColumn="fileName"
                    sorting={[{ id: "fileName", desc: false }]}
                  />
                </>
              )}
            </div>
          </div>
        </TabsContent>

        {/* About Tab */}
        {showToolsAndAboutTabs && (
          <TabsContent value="about">
            <div className="s-flex s-h-full s-min-h-0 s-flex-1 s-flex-col s-overflow-y-auto s-px-6">
              <div className="s-mx-auto s-flex s-w-full s-max-w-4xl s-flex-col s-gap-4 s-py-8">
                <h2 className="s-heading-2xl s-text-foreground dark:s-text-foreground-night">
                  About {space.name}
                </h2>
                <p className="s-text-foreground dark:s-text-foreground-night">
                  {space.description}
                </p>
              </div>
            </div>
          </TabsContent>
        )}

        {/* Settings Tab */}
        <TabsContent value="settings">
          <div className="s-flex s-h-full s-min-h-0 s-flex-1 s-flex-col s-overflow-y-auto s-px-6">
            <div className="s-mx-auto s-flex s-w-full s-max-w-4xl s-flex-col s-gap-8 s-px-6 s-py-8">
              {/* Room Name Section */}
              <div className="s-flex s-gap-2">
                <h3 className="s-heading-2xl s-flex-1">Settings</h3>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" icon={MoreIcon} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      icon={TrashIcon}
                      label="Archive project"
                      variant="warning"
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="s-flex s-w-full s-flex-col s-gap-2">
                <h3 className="s-heading-lg">Name</h3>
                <div className="s-flex s-w-full s-min-w-0 s-gap-2">
                  <Input
                    value={roomName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setRoomName(e.target.value);
                      setIsEditingName(e.target.value !== space.name);
                    }}
                    placeholder="Enter room name"
                    containerClassName="s-flex-1"
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
              <div className="s-flex s-w-full s-flex-col s-gap-2">
                <h3 className="s-heading-lg">Description</h3>
                <div className="s-flex s-w-full s-min-w-0 s-gap-2">
                  <Input
                    value={roomDescription}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setRoomDescription(e.target.value);
                      setIsEditingDescription(
                        e.target.value !== (space.description ?? "")
                      );
                    }}
                    placeholder="Enter room description"
                    containerClassName="s-flex-1"
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

              <div className="s-flex s-w-full s-flex-col s-gap-2">
                <h3 className="s-heading-lg">Visibility</h3>
                <div className="s-flex s-items-start s-items-center s-justify-between s-gap-4 s-border-y s-border-border dark:s-border-border-night s-py-4">
                  <div className="s-flex s-flex-col">
                    <div className="s-heading-sm s-text-foreground dark:s-text-foreground-night">
                      Opened to everyone
                    </div>
                    <div className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                      Anyone in the workspace can find and join the room.
                    </div>
                  </div>
                  <SliderToggle
                    size="xs"
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
              {/* Members Section */}
              <div className="s-flex s-flex-col s-gap-3">
                <div className="s-flex s-items-center s-gap-2">
                  <h3 className="s-heading-lg s-flex-1">Members & Editors</h3>
                  <Button
                    label="Manage"
                    variant="outline"
                    icon={UserGroupIcon}
                    onClick={() => onInviteMembers?.()}
                  />
                </div>
                {members.length === 0 ? (
                  <EmptyCTA
                    message="Feeling lonely? Invite participants!."
                    action={
                      <EmptyCTAButton
                        icon={UserGroupIcon}
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
                      className="s-w-full"
                    />
                    <DataTable
                      columns={memberColumns}
                      data={filteredMembers}
                      sorting={[{ id: "name", desc: false }]}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

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

      {/* Delete DataSource Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open: boolean) => {
          if (!open) {
            setDeleteDialogOpen(false);
            setSelectedDataSourceId(null);
          }
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Delete file?</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            {selectedDataSourceId && (
              <div>
                Are you sure you want to delete "
                {dataSources.find((ds) => ds.id === selectedDataSourceId)
                  ?.fileName || "this file"}
                "? This action cannot be undone.
              </div>
            )}
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => {
                setDeleteDialogOpen(false);
                setSelectedDataSourceId(null);
              },
            }}
            rightButtonProps={{
              label: "Delete",
              variant: "warning",
              onClick: handleDeleteConfirm,
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
            setDocumentView("preview");
          }
        }}
      >
        <SheetContent size="3xl" side="right">
          <SheetHeader>
            <SheetTitle>
              <div className="s-flex s-flex-1 s-flex-col s-w-full s-items-start s-gap-4">
                <div className="s-flex s-items-center s-gap-2">
                  {selectedDataSource?.icon && (
                    <Icon visual={selectedDataSource.icon} size="md" />
                  )}
                  <span>{selectedDataSource?.fileName || "Document View"}</span>
                </div>
                <div className="s-flex s-w-full s-items-center s-gap-2">
                  <ButtonsSwitchList
                    defaultValue="preview"
                    size="xs"
                    onValueChange={(value) => {
                      if (value === "preview" || value === "extracted") {
                        setDocumentView(value);
                      }
                    }}
                  >
                    <ButtonsSwitch value="preview" label="Preview" />
                    <ButtonsSwitch
                      value="extracted"
                      label="Extracted information"
                    />
                  </ButtonsSwitchList>
                  <div className="s-flex-1" />
                  <div className="s-flex s-items-center s-gap-2">
                    <Button
                      variant="outline"
                      size="icon-xs"
                      icon={ArrowDownOnSquareIcon}
                      tooltip="Download"
                    />
                    <Button
                      variant="outline"
                      size="icon-xs"
                      icon={ExternalLinkIcon}
                      tooltip="Open in tab"
                    />
                  </div>
                </div>
              </div>
            </SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="s-flex s-flex-col s-items-center s-justify-center s-py-16">
              <p className="s-text-foreground dark:s-text-foreground-night">
                {documentView === "preview"
                  ? "Document Preview"
                  : "Extracted information"}
              </p>
            </div>
          </SheetContainer>
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
            <div className="s-flex s-flex-col s-items-center s-justify-center s-py-16">
              <p className="s-text-foreground dark:s-text-foreground-night">
                Member detailview
              </p>
            </div>
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}
