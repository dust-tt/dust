import {
  CloudArrowLeftRight,
  CoinsStacked01,
  CreditCard01,
  Database01,
  Lock01,
  MessageChatSquare,
  PuzzlePiece01,
  Robot,
  ShapesPlus,
  ShieldTick,
  UsersPlus,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

import type { AdminRequest, RequestOutcome, RequestType, User } from "./types";
import { getUserById } from "./users";

// Admin requests: the queue an admin (or a manager) works through. Every entry
// is the same record — requester, target, payload, decision — so a single list
// and a single detail panel can host the different request types.

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  spendLimitUpgrade: "Spend-limit upgrade",
  seatUpgrade: "Seat upgrade",
  dataSourceAdd: "Data source addition",
  toolAdd: "Tool addition",
  connectorAdd: "Connector addition",
  userInvitation: "User invitation",
  spaceAccess: "Pod access",
  roleChange: "Role change",
  agentPublication: "Agent publication",
  skillPublication: "Skill publication",
  conversationAccess: "Conversation access",
};

export const REQUEST_TYPE_ICONS: Record<
  RequestType,
  ComponentType<{ className?: string }>
> = {
  spendLimitUpgrade: CoinsStacked01,
  seatUpgrade: CreditCard01,
  dataSourceAdd: Database01,
  toolAdd: ShapesPlus,
  connectorAdd: CloudArrowLeftRight,
  userInvitation: UsersPlus,
  spaceAccess: Lock01,
  roleChange: ShieldTick,
  agentPublication: Robot,
  skillPublication: PuzzlePiece01,
  conversationAccess: MessageChatSquare,
};

export const REQUEST_OUTCOME_LABELS: Record<RequestOutcome, string> = {
  approved: "Approved",
  denied: "Denied",
};

/**
 * The person a request is for, when that is not the requester — a manager
 * asking for someone else's promotion, seat, or spend limit.
 */
export function getBeneficiary(request: AdminRequest): User | undefined {
  const { kind, id } = request.target;
  if (kind !== "user" || !id || id === request.requesterId) {
    return undefined;
  }
  return getUserById(id);
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
      type: "spendLimitUpgrade",
      title: "Raise my monthly spend limit",
      requesterId: "3",
      createdAt: hoursAgo(1),
      target: { kind: "user", label: "Sophie Müller", id: "3" },
      details: [
        { label: "Current limit", value: "2,000 credits / month" },
        { label: "Requested limit", value: "5,000 credits / month" },
        { label: "Used this cycle", value: "2,000 credits (100%)" },
      ],
      status: "pending",
    },
    {
      id: "request-2",
      type: "dataSourceAdd",
      title: "Add the Zendesk export to Customer Success",
      requesterId: "9",
      createdAt: hoursAgo(3),
      target: { kind: "space", label: "Customer Success", id: "space-11" },
      details: [
        { label: "Source", value: "Zendesk export (CSV, 48 MB)" },
        { label: "Destination", value: "Customer Success" },
        { label: "Visibility", value: "Pod members only" },
      ],
      message:
        "The team keeps re-uploading this file per conversation. Better as a shared source.",
      status: "pending",
    },
    {
      id: "request-3",
      type: "spaceAccess",
      title: "Access to the Security & Compliance Pod",
      requesterId: "6",
      createdAt: hoursAgo(5),
      target: { kind: "space", label: "Security & Compliance", id: "space-14" },
      details: [
        { label: "Pod", value: "Security & Compliance (restricted)" },
        { label: "Requested role", value: "Member" },
        { label: "Current access", value: "None" },
      ],
      message: "I'm taking over the SOC 2 evidence collection from Marco.",
      status: "pending",
    },
    {
      id: "request-4",
      type: "toolAdd",
      title: "Enable the Jira tool for Engineering",
      requesterId: "2",
      createdAt: hoursAgo(9),
      target: { kind: "tool", label: "Jira" },
      details: [
        { label: "Tool", value: "Jira (remote MCP server)" },
        { label: "Scope", value: "Engineering" },
        { label: "Stake", value: "Read-only (low)" },
      ],
      status: "pending",
    },
    {
      id: "request-5",
      type: "roleChange",
      title: "Promote Elena to Manager",
      requesterId: "8",
      createdAt: hoursAgo(20),
      target: { kind: "user", label: "Elena García", id: "9" },
      details: [
        { label: "Member", value: "Elena García" },
        { label: "Current role", value: "Member" },
        { label: "Requested role", value: "Manager" },
      ],
      message:
        "She's handling most of the Pod setup for Sales already and keeps having to ask us.",
      status: "pending",
    },
    {
      id: "request-6",
      type: "connectorAdd",
      title: "Connect the Product Notion workspace",
      requesterId: "5",
      createdAt: daysAgo(1),
      target: { kind: "connector", label: "Notion" },
      details: [
        { label: "Connector", value: "Notion" },
        { label: "Selection", value: "Product wiki (14 pages)" },
        { label: "Destination", value: "Product" },
      ],
      status: "pending",
    },
    {
      id: "request-7",
      type: "userInvitation",
      title: "Invite two contractors to the workspace",
      requesterId: "7",
      createdAt: daysAgo(1),
      target: { kind: "workspace", label: "ACME" },
      details: [
        {
          label: "Invitees",
          value: "n.okafor@contractor.io, r.silva@contractor.io",
        },
        { label: "Role", value: "Member" },
        { label: "Seats left", value: "3 of 50" },
      ],
      status: "pending",
    },
    {
      id: "request-8",
      type: "agentPublication",
      title: "Publish the RiskAnalyzer agent company-wide",
      requesterId: "4",
      createdAt: daysAgo(2),
      target: { kind: "agent", label: "RiskAnalyzer", id: "agent-6" },
      details: [
        { label: "Agent", value: "RiskAnalyzer" },
        { label: "Current visibility", value: "Editors only" },
        { label: "Requested visibility", value: "Whole workspace" },
        { label: "Tools used", value: "Search, Extract data" },
      ],
      status: "pending",
    },

    // ── Done ─────────────────────────────────────────────────────────────────
    {
      id: "request-9",
      type: "seatUpgrade",
      title: "Upgrade Thomas to a Pro seat",
      requesterId: "4",
      createdAt: daysAgo(3),
      target: { kind: "user", label: "Thomas Schmidt", id: "4" },
      details: [
        { label: "Member", value: "Thomas Schmidt" },
        { label: "Current seat", value: "Free" },
        { label: "Requested seat", value: "Pro" },
      ],
      status: "done",
      outcome: "approved",
      resolvedByUserId: "1",
      resolvedAt: daysAgo(2),
    },
    {
      id: "request-10",
      type: "toolAdd",
      title: "Enable the Salesforce tool for Sales",
      requesterId: "8",
      createdAt: daysAgo(4),
      target: { kind: "tool", label: "Salesforce" },
      details: [
        { label: "Tool", value: "Salesforce (remote MCP server)" },
        { label: "Scope", value: "Sales" },
        { label: "Stake", value: "Read and write (high)" },
      ],
      status: "done",
      outcome: "approved",
      resolvedByUserId: "1",
      resolvedAt: daysAgo(3),
    },
    {
      id: "request-11",
      type: "spaceAccess",
      title: "Access to the Series C Pod",
      requesterId: "10",
      createdAt: daysAgo(5),
      target: { kind: "space", label: "Series C", id: "space-5" },
      details: [
        { label: "Pod", value: "Series C (restricted)" },
        { label: "Requested role", value: "Member" },
        { label: "Current access", value: "None" },
      ],
      message: "Working on the data room checklist.",
      status: "done",
      outcome: "denied",
      resolvedByUserId: "2",
      resolvedAt: daysAgo(4),
    },
    {
      id: "request-12",
      type: "spendLimitUpgrade",
      title: "Raise my monthly spend limit",
      requesterId: "6",
      createdAt: daysAgo(6),
      target: { kind: "user", label: "Marco Ferrari", id: "6" },
      details: [
        { label: "Current limit", value: "1,000 credits / month" },
        { label: "Requested limit", value: "4,000 credits / month" },
        { label: "Used this cycle", value: "1,000 credits (100%)" },
      ],
      status: "done",
      outcome: "approved",
      resolvedByUserId: "1",
      resolvedAt: daysAgo(6),
    },
    {
      id: "request-13",
      type: "dataSourceAdd",
      title: "Add the pricing deck to Enterprise Sales",
      requesterId: "5",
      createdAt: daysAgo(7),
      target: { kind: "space", label: "Enterprise Sales", id: "space-20" },
      details: [
        { label: "Source", value: "Pricing_2026.pptx" },
        { label: "Destination", value: "Enterprise Sales" },
        { label: "Visibility", value: "Pod members only" },
      ],
      status: "done",
      outcome: "approved",
      resolvedByUserId: "2",
      resolvedAt: daysAgo(7),
    },
    {
      id: "request-14",
      type: "skillPublication",
      title: "Publish the Meeting Recap skill",
      requesterId: "7",
      createdAt: daysAgo(9),
      target: { kind: "skill", label: "Meeting Recap" },
      details: [
        { label: "Skill", value: "Meeting Recap" },
        { label: "Current visibility", value: "Personal" },
        { label: "Requested visibility", value: "Whole workspace" },
      ],
      status: "done",
      outcome: "approved",
      resolvedByUserId: "1",
      resolvedAt: daysAgo(8),
    },
    {
      id: "request-15",
      type: "conversationAccess",
      title: "Restore a conversation that went unavailable",
      requesterId: "9",
      createdAt: daysAgo(11),
      target: { kind: "conversation", label: "Q4 budget reallocation" },
      details: [
        { label: "Conversation", value: "Q4 budget reallocation" },
        { label: "Cause", value: "Personal skill removed by its owner" },
        { label: "Participants", value: "4 members" },
      ],
      message: "The whole thread disappeared for everyone but the owner.",
      status: "done",
      outcome: "approved",
      resolvedByUserId: "2",
      resolvedAt: daysAgo(10),
    },
    {
      id: "request-16",
      type: "roleChange",
      title: "Promote Pierre to Admin",
      requesterId: "8",
      createdAt: daysAgo(13),
      target: { kind: "user", label: "Pierre Martin", id: "8" },
      details: [
        { label: "Member", value: "Pierre Martin" },
        { label: "Current role", value: "Member" },
        { label: "Requested role", value: "Admin" },
      ],
      status: "done",
      outcome: "denied",
      resolvedByUserId: "1",
      resolvedAt: daysAgo(12),
    },
  ];
}
