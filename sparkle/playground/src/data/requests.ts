import {
  BookOpen01,
  CoinsStacked01,
  ConfluenceLogo,
  CubeOutline,
  DriveLogo,
  Eye,
  GithubLogo,
  HubspotLogo,
  JiraLogo,
  Lock01,
  NotionLogo,
  SalesforceLogo,
  ShapesPlus,
  ShieldTick,
  SlackLogo,
  SyncCloud02,
  UsersPlus,
  ZendeskLogo,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

import type {
  AdminRequest,
  RequestDocument,
  RequestOutcome,
  RequestRole,
  RequestType,
  RequestVariant,
  SeatType,
  User,
} from "./types";
import { getUserById } from "./users";

// Admin requests: the queue an admin (or a manager) works through. Every entry
// is the same record — requester, target, payload, decision — so a single list
// and a single detail panel can host the different request types. Cases that
// call for the same decision share a type; the `variant` says which case it is.

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  creditManagement: "Credit management",
  knowledgeManagement: "Knowledge management",
  toolAddition: "Tool addition",
  memberInvitation: "Member invitation",
  access: "Access request",
  roleChange: "Role change",
  publication: "Publication",
};

const REQUEST_TYPE_ICONS: Record<
  RequestType,
  ComponentType<{ className?: string }>
> = {
  creditManagement: CoinsStacked01,
  knowledgeManagement: BookOpen01,
  toolAddition: ShapesPlus,
  memberInvitation: UsersPlus,
  access: Lock01,
  roleChange: ShieldTick,
  publication: Eye,
};

const REQUEST_VARIANT_ICONS: Record<
  RequestVariant,
  ComponentType<{ className?: string }>
> = {
  dataSource: BookOpen01,
  connector: SyncCloud02,
  toolCreate: ShapesPlus,
  toolAddToSpace: ShapesPlus,
  podAccess: CubeOutline,
  spaceAccess: Lock01,
  agent: Eye,
  skill: Eye,
};

/** The icon that stands for a whole type, used by the type filter. */
export function getRequestTypeIcon(
  type: RequestType
): ComponentType<{ className?: string }> {
  return REQUEST_TYPE_ICONS[type];
}

/** The row icon: the variant's when the type hosts several cases. */
export function getRequestIcon(
  request: AdminRequest
): ComponentType<{ className?: string }> {
  return request.variant
    ? REQUEST_VARIANT_ICONS[request.variant]
    : REQUEST_TYPE_ICONS[request.type];
}

export const REQUEST_OUTCOME_LABELS: Record<RequestOutcome, string> = {
  approved: "Approved",
  denied: "Denied",
};

export const SEAT_TYPE_LABELS: Record<SeatType, string> = {
  free: "Free",
  pro: "Pro",
  max: "Max",
  platform: "Platform",
};

export const SEAT_CHIP_COLORS: Record<
  SeatType,
  "primary" | "highlight" | "success" | "warning"
> = {
  free: "primary",
  pro: "highlight",
  platform: "success",
  max: "warning",
};

/** Seats an admin can move a member up to, in the product's order. */
export const SEAT_UPGRADE_TARGET: Partial<Record<SeatType, SeatType>> = {
  free: "pro",
  pro: "max",
};

export const ROLE_LABELS: Record<RequestRole, string> = {
  admin: "Admin",
  manager: "Manager",
  member: "Member",
};

/** The colors the members table gives each role. */
export const ROLE_CHIP_COLORS: Record<
  RequestRole,
  "warning" | "highlight" | "success"
> = {
  admin: "warning",
  manager: "highlight",
  member: "success",
};

// Connectors and tools are named after the platform they talk to, so one map
// covers both, plus the source a document comes from.
const PLATFORM_LOGOS: Record<string, ComponentType<{ className?: string }>> = {
  slack: SlackLogo,
  notion: NotionLogo,
  drive: DriveLogo,
  confluence: ConfluenceLogo,
  github: GithubLogo,
  jira: JiraLogo,
  salesforce: SalesforceLogo,
  zendesk: ZendeskLogo,
  hubspot: HubspotLogo,
};

const PROVIDER_LABELS: Record<
  NonNullable<RequestDocument["provider"]>,
  string
> = {
  slack: "Slack",
  notion: "Notion",
  drive: "Google Drive",
  confluence: "Confluence",
  github: "GitHub",
};

/** Matches a connector or tool name to its platform logo. */
export function getPlatformLogo(
  name: string
): ComponentType<{ className?: string }> | undefined {
  return PLATFORM_LOGOS[name.toLowerCase()];
}

export function getProviderLogo(
  provider: RequestDocument["provider"]
): ComponentType<{ className?: string }> | undefined {
  return provider ? PLATFORM_LOGOS[provider] : undefined;
}

export function getProviderLabel(
  provider: RequestDocument["provider"]
): string | undefined {
  return provider ? PROVIDER_LABELS[provider] : undefined;
}

/**
 * The person a request is for, when that is not the requester — a manager
 * asking for someone else's access, promotion or spend limit.
 */
export function getBeneficiary(request: AdminRequest): User | undefined {
  const { beneficiaryId, requesterId } = request;
  if (!beneficiaryId || beneficiaryId === requesterId) {
    return undefined;
  }
  return getUserById(beneficiaryId);
}

/** Names the decision maker, saying "you" when it was the current user. */
export function getResolverLabel(
  request: AdminRequest,
  currentUserId?: string
): string {
  if (!request.resolvedByUserId) {
    return "";
  }
  if (request.resolvedByUserId === currentUserId) {
    return "you";
  }
  return getUserById(request.resolvedByUserId)?.fullName ?? "Unknown";
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function daysAgo(days: number): Date {
  return hoursAgo(days * 24);
}

/**
 * Build the request catalog with timestamps relative to now, so the list always
 * looks freshly filled whichever day the playground is opened.
 */
export function createMockRequests(): AdminRequest[] {
  return [
    // ── Pending ──────────────────────────────────────────────────────────────
    {
      id: "request-1",
      type: "creditManagement",
      title: "Raise my monthly spend limit",
      requesterId: "3",
      createdAt: hoursAgo(1),
      target: { kind: "user", label: "Sophie Müller", id: "3" },
      credit: { usedPercent: 100, seatType: "pro", limit: 2000 },
      status: "pending",
    },
    {
      id: "request-2",
      type: "knowledgeManagement",
      variant: "dataSource",
      title: "Add the Q3 support digests to Customer Success",
      requesterId: "9",
      createdAt: hoursAgo(2),
      target: { kind: "pod", label: "Customer Success", id: "space-11" },
      documents: [
        { name: "Escalation threads — Q3", fileType: "md", provider: "slack" },
        { name: "Support playbook", fileType: "doc", provider: "notion" },
        { name: "Zendesk export", fileType: "csv" },
      ],
      message:
        "The team keeps re-uploading these per conversation. Better as a shared source.",
      status: "pending",
    },
    {
      id: "request-3",
      type: "access",
      variant: "podAccess",
      title: "Access to the Security & Compliance Pod",
      requesterId: "6",
      createdAt: hoursAgo(5),
      target: { kind: "pod", label: "Security & Compliance", id: "space-14" },
      message: "I'm taking over the SOC 2 evidence collection from Marco.",
      status: "pending",
    },
    {
      id: "request-4",
      type: "toolAddition",
      variant: "toolCreate",
      title: "Create a Jira tool for Engineering",
      requesterId: "2",
      createdAt: hoursAgo(7),
      target: { kind: "tool", label: "Jira" },
      destination: { kind: "pod", label: "Engineering", id: "space-2" },
      status: "pending",
    },
    {
      id: "request-5",
      type: "knowledgeManagement",
      variant: "connector",
      title: "Connect the Product Notion workspace",
      requesterId: "5",
      createdAt: hoursAgo(9),
      target: { kind: "connector", label: "Notion" },
      message:
        "The Product wiki is where the roadmap lives. We need it in Dust before Thursday's sync.",
      status: "pending",
    },
    {
      id: "request-6",
      type: "roleChange",
      title: "Promote Elena to Manager",
      requesterId: "8",
      beneficiaryId: "9",
      createdAt: hoursAgo(20),
      target: { kind: "user", label: "Elena García", id: "9" },
      roles: { current: "member", requested: "manager" },
      message:
        "She's handling most of the Pod setup for Sales already and keeps having to ask us.",
      status: "pending",
    },
    {
      id: "request-7",
      type: "access",
      variant: "spaceAccess",
      title: "Access to Legal & Compliance for Elena",
      requesterId: "8",
      beneficiaryId: "9",
      createdAt: daysAgo(1),
      target: {
        kind: "space",
        label: "Legal & Compliance",
        id: "company-space-5",
      },
      status: "pending",
    },
    {
      id: "request-8",
      type: "memberInvitation",
      title: "Invite a new member",
      requesterId: "7",
      createdAt: daysAgo(1),
      target: { kind: "workspace", label: "ACME" },
      details: [{ label: "Email", value: "n.okafor@contractor.io" }],
      roles: { requested: "member" },
      message: "Contractor on the onboarding redesign, starts Monday.",
      status: "pending",
    },
    {
      id: "request-9",
      type: "publication",
      variant: "agent",
      title: "Publish the RiskAnalyzer agent company-wide",
      requesterId: "4",
      createdAt: daysAgo(2),
      target: { kind: "agent", label: "RiskAnalyzer", id: "agent-6" },
      status: "pending",
    },
    {
      id: "request-10",
      type: "toolAddition",
      variant: "toolAddToSpace",
      title: "Add the Salesforce tool to the Sales Library",
      requesterId: "8",
      createdAt: daysAgo(2),
      target: { kind: "tool", label: "Salesforce" },
      destination: {
        kind: "space",
        label: "Sales Library",
        id: "company-space-3",
      },
      status: "pending",
    },
    {
      id: "request-11",
      type: "publication",
      variant: "skill",
      title: "Publish the Meeting Recap skill",
      requesterId: "7",
      createdAt: daysAgo(3),
      target: { kind: "skill", label: "Meeting Recap" },
      status: "pending",
    },
    {
      id: "request-12",
      type: "creditManagement",
      title: "Raise the spend limit for Carlos",
      requesterId: "8",
      beneficiaryId: "10",
      createdAt: daysAgo(4),
      target: { kind: "user", label: "Carlos Rodríguez", id: "10" },
      // Already on the top seat, so a new limit is the only lever left.
      credit: { usedPercent: 92, seatType: "max", limit: 4000 },
      message: "He runs the weekly pipeline review for the whole team.",
      status: "pending",
    },

    // ── Handled ──────────────────────────────────────────────────────────────
    {
      id: "request-13",
      type: "creditManagement",
      title: "Raise my monthly spend limit",
      requesterId: "6",
      createdAt: hoursAgo(6),
      target: { kind: "user", label: "Marco Ferrari", id: "6" },
      credit: { usedPercent: 100, seatType: "pro", limit: 1000 },
      status: "done",
      outcome: "approved",
      resolvedByUserId: "1",
      resolvedAt: hoursAgo(3),
      resolutionMessage: "Seat upgraded to Max",
    },
    {
      id: "request-14",
      type: "knowledgeManagement",
      variant: "connector",
      title: "Connect the Support Slack channels",
      requesterId: "9",
      createdAt: daysAgo(2),
      target: { kind: "connector", label: "Slack" },
      message:
        "Escalations are all in Slack today. Support agents can't answer without them.",
      status: "done",
      outcome: "approved",
      resolvedByUserId: "1",
      resolvedAt: daysAgo(1),
    },
    {
      id: "request-15",
      type: "access",
      variant: "podAccess",
      title: "Access to the Series C Pod",
      requesterId: "10",
      createdAt: daysAgo(3),
      target: { kind: "pod", label: "Series C", id: "space-5" },
      message: "Working on the data room checklist.",
      status: "done",
      outcome: "denied",
      resolvedByUserId: "2",
      resolvedAt: daysAgo(1),
      resolutionMessage:
        "The data room stays with the deal team until the round closes.",
    },
    {
      id: "request-16",
      type: "toolAddition",
      variant: "toolAddToSpace",
      title: "Add the Zendesk tool to Customer Support",
      requesterId: "5",
      createdAt: daysAgo(4),
      target: { kind: "tool", label: "Zendesk" },
      destination: {
        kind: "space",
        label: "Customer Support",
        id: "company-space-4",
      },
      status: "done",
      outcome: "approved",
      resolvedByUserId: "1",
      resolvedAt: daysAgo(3),
    },
    {
      id: "request-17",
      type: "memberInvitation",
      title: "Invite a new member",
      requesterId: "3",
      createdAt: daysAgo(5),
      target: { kind: "workspace", label: "ACME" },
      details: [{ label: "Email", value: "j.laurent@acme.com" }],
      roles: { requested: "member" },
      status: "done",
      outcome: "approved",
      resolvedByUserId: "2",
      resolvedAt: daysAgo(4),
    },
    {
      id: "request-18",
      type: "roleChange",
      title: "Promote Pierre to Admin",
      requesterId: "8",
      beneficiaryId: "8",
      createdAt: daysAgo(6),
      target: { kind: "user", label: "Pierre Martin", id: "8" },
      roles: { current: "member", requested: "admin" },
      status: "done",
      outcome: "denied",
      resolvedByUserId: "1",
      resolvedAt: daysAgo(5),
      resolutionMessage: "Manager covers what you need. Let's revisit in Q4.",
    },
    {
      id: "request-19",
      type: "knowledgeManagement",
      variant: "dataSource",
      title: "Add the pricing deck to the Sales Library",
      requesterId: "5",
      createdAt: daysAgo(9),
      target: { kind: "space", label: "Sales Library", id: "company-space-3" },
      documents: [
        { name: "Pricing 2026", fileType: "pptx", provider: "drive" },
        { name: "Discount matrix", fileType: "xlsx", provider: "drive" },
      ],
      status: "done",
      outcome: "approved",
      resolvedByUserId: "2",
      resolvedAt: daysAgo(8),
    },
    {
      id: "request-20",
      type: "access",
      variant: "spaceAccess",
      title: "Access to Engineering Docs for Anna",
      requesterId: "2",
      beneficiaryId: "11",
      createdAt: daysAgo(12),
      target: {
        kind: "space",
        label: "Engineering Docs",
        id: "company-space-2",
      },
      status: "done",
      outcome: "approved",
      resolvedByUserId: "1",
      resolvedAt: daysAgo(11),
    },
    {
      id: "request-21",
      type: "publication",
      variant: "agent",
      title: "Publish the RunbookMaster agent to Engineering",
      requesterId: "4",
      createdAt: daysAgo(14),
      target: { kind: "agent", label: "RunbookMaster", id: "agent-8" },
      destination: { kind: "pod", label: "Engineering", id: "space-2" },
      status: "done",
      outcome: "approved",
      resolvedByUserId: "2",
      resolvedAt: daysAgo(13),
    },
  ];
}
