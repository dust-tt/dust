import { Clock, SyncCloud02 } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

import { getPlatformLogo } from "./requests";
import type {
  Conversation,
  Trigger,
  TriggerKind,
  TriggerStatus,
} from "./types";

// The triggers a member owns: the schedules and webhooks that run an agent on
// their behalf. The product manages these from the Automations dialog, and the
// wording here follows it — Enabled/Disabled rather than Active/Paused, and the
// same two sentence forms for what makes a trigger fire.

export const TRIGGER_STATUS_LABELS: Record<TriggerStatus, string> = {
  enabled: "Enabled",
  disabled: "Disabled",
  disabled_by_manager: "Disabled by manager",
};

/** Whose credits the runs are charged to, as the product's pool selector puts it. */
export const TRIGGER_POOL_LABELS: Record<Trigger["pool"], string> = {
  member: "Member",
  workspace: "Workspace",
};

/**
 * What kind of trigger fired, said the way a reader thinks of it: a clock, or
 * something that happened elsewhere. Wherever a run shows its type — the
 * Automations list, the Inbox, a Pod's conversations — it uses these words.
 */
export const TRIGGER_KIND_LABELS: Record<TriggerKind, string> = {
  schedule: "Scheduled",
  webhook: "Event",
};

/** Credits as the table shows them: short enough to sit in a narrow column. */
export function formatCreditsCompact(credits: number): string {
  return credits.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

/** Credits in full, for the tooltip that spells out what the column rounded. */
export function formatCredits(credits: number): string {
  return credits.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

/** A clock stands for every schedule; a webhook wears its platform's logo. */
export function getTriggerIcon(
  trigger: Trigger
): ComponentType<{ className?: string }> {
  if (trigger.kind === "schedule") {
    return Clock;
  }
  return trigger.webhook
    ? (getPlatformLogo(trigger.webhook.provider) ?? SyncCloud02)
    : SyncCloud02;
}

/** What makes the trigger fire, in the product's own phrasing. */
export function getTriggerDescription(trigger: Trigger): string {
  if (trigger.kind === "schedule") {
    return trigger.schedule ? `Runs ${trigger.schedule.label}.` : "";
  }
  if (!trigger.webhook) {
    return "";
  }
  const { event, sourceName } = trigger.webhook;
  const on = `on ${sourceName}'s source.`;
  return event ? `Triggered by ${event} events ${on}` : `Triggered ${on}`;
}

export function getTriggerById(
  triggers: Trigger[],
  triggerId: string
): Trigger | undefined {
  return triggers.find((trigger) => trigger.id === triggerId);
}

/**
 * The conversations automated work is made of: one per trigger that has
 * already fired. A run is an agent talking to nobody, so it carries no human
 * participant — its trigger is what says who ran and why.
 */
export function createTriggeredConversations(
  triggers: Trigger[]
): Conversation[] {
  return triggers.flatMap((trigger) => {
    if (!trigger.lastRunAt) {
      return [];
    }

    return [
      {
        id: `trigger-run-${trigger.id}`,
        title: trigger.name,
        description: getTriggerDescription(trigger),
        createdAt: trigger.lastRunAt,
        updatedAt: trigger.lastRunAt,
        userParticipants: [],
        agentParticipants: [trigger.agentId],
        spaceId: trigger.spaceId,
        triggerId: trigger.id,
      },
    ];
  });
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function daysAgo(days: number): Date {
  return hoursAgo(days * 24);
}

/**
 * What each trigger has done over the period the Automations table reports on.
 * Kept apart from the catalog below so a trigger's definition stays about what
 * makes it fire rather than what it has spent.
 */
const TRIGGER_USAGE: Record<string, { runCount: number; credits: number }> = {
  "trigger-1": { runCount: 30, credits: 672 },
  "trigger-2": { runCount: 22, credits: 436 },
  "trigger-3": { runCount: 148, credits: 2410 },
  "trigger-4": { runCount: 96, credits: 1840 },
  "trigger-5": { runCount: 4, credits: 210 },
  "trigger-6": { runCount: 61, credits: 944 },
  "trigger-7": { runCount: 1, credits: 46 },
  "trigger-8": { runCount: 0, credits: 0 },
  "trigger-9": { runCount: 12, credits: 128 },
  "trigger-10": { runCount: 0, credits: 0 },
  "trigger-11": { runCount: 8, credits: 96 },
  "trigger-12": { runCount: 0, credits: 0 },
};

/**
 * The catalog of triggers, all owned by whoever is looking at the playground so
 * the list is never empty, with timestamps relative to now.
 */
export function createMockTriggers(editorId: string): Trigger[] {
  const triggers: Omit<Trigger, "runCount" | "credits">[] = [
    {
      id: "trigger-1",
      name: "Morning news digest",
      kind: "schedule",
      agentId: "agent-4",
      editorId,
      status: "enabled",
      pool: "member",
      spaceId: "space-9",
      schedule: {
        cron: "0 8 * * *",
        label: "every day at 8:00 AM",
        timezone: "Europe/Paris",
      },
      createdAt: daysAgo(96),
      lastRunAt: hoursAgo(4),
    },
    {
      id: "trigger-2",
      name: "Standup recap",
      kind: "schedule",
      agentId: "agent-8",
      editorId,
      status: "enabled",
      pool: "member",
      spaceId: "space-2",
      schedule: {
        cron: "15 9 * * 1-5",
        label: "at 9:15 AM, Monday through Friday",
        timezone: "Europe/Paris",
      },
      createdAt: daysAgo(64),
      lastRunAt: hoursAgo(9),
    },
    {
      id: "trigger-3",
      name: "Pull request reviewer",
      kind: "webhook",
      agentId: "agent-14",
      editorId,
      status: "enabled",
      pool: "workspace",
      spaceId: "space-2",
      webhook: {
        provider: "github",
        sourceName: "GitHub",
        event: "pull_request.opened",
      },
      createdAt: daysAgo(41),
      lastRunAt: hoursAgo(2),
    },
    {
      id: "trigger-4",
      name: "Escalation triage",
      kind: "webhook",
      agentId: "agent-18",
      editorId,
      status: "enabled",
      pool: "workspace",
      spaceId: "space-11",
      webhook: {
        provider: "zendesk",
        sourceName: "Zendesk",
        event: "ticket.escalated",
      },
      createdAt: daysAgo(28),
      lastRunAt: hoursAgo(1),
    },
    {
      id: "trigger-5",
      name: "Weekly pipeline review",
      kind: "schedule",
      agentId: "agent-13",
      editorId,
      status: "enabled",
      pool: "member",
      spaceId: "space-8",
      schedule: {
        cron: "0 7 * * 1",
        label: "at 7:00 AM, only on Monday",
        timezone: "Europe/Paris",
      },
      createdAt: daysAgo(120),
      lastRunAt: daysAgo(2),
    },
    {
      id: "trigger-6",
      name: "Sprint ticket summary",
      kind: "webhook",
      agentId: "agent-12",
      editorId,
      status: "enabled",
      pool: "member",
      spaceId: "space-4",
      webhook: {
        provider: "jira",
        sourceName: "Jira",
        event: "issue.created",
      },
      createdAt: daysAgo(53),
      lastRunAt: hoursAgo(6),
    },
    {
      id: "trigger-7",
      name: "Monthly usage report",
      kind: "schedule",
      agentId: "agent-11",
      editorId,
      status: "enabled",
      pool: "workspace",
      spaceId: "space-13",
      schedule: {
        cron: "0 6 1 * *",
        label: "at 6:00 AM, on day 1 of the month",
        timezone: "Europe/Paris",
      },
      createdAt: daysAgo(210),
      lastRunAt: daysAgo(9),
    },
    {
      id: "trigger-8",
      name: "Brand mentions watch",
      kind: "webhook",
      agentId: "agent-9",
      editorId,
      status: "disabled",
      pool: "member",
      spaceId: "space-9",
      webhook: {
        provider: "slack",
        sourceName: "Slack",
        event: "message.mention",
      },
      createdAt: daysAgo(74),
      lastRunAt: daysAgo(21),
    },
    {
      id: "trigger-9",
      name: "Roadmap page watcher",
      kind: "webhook",
      agentId: "agent-16",
      editorId,
      status: "enabled",
      pool: "member",
      webhook: {
        provider: "notion",
        sourceName: "Product Notion",
      },
      createdAt: daysAgo(17),
      lastRunAt: hoursAgo(30),
    },
    {
      id: "trigger-10",
      name: "Incident postmortem draft",
      kind: "schedule",
      agentId: "agent-10",
      editorId,
      // Someone with the keys switched this one off; only they can switch it on.
      status: "disabled_by_manager",
      pool: "workspace",
      spaceId: "space-15",
      schedule: {
        cron: "0 17 * * 5",
        label: "at 5:00 PM, only on Friday",
        timezone: "Europe/Paris",
      },
      createdAt: daysAgo(138),
      lastRunAt: daysAgo(34),
    },
    {
      id: "trigger-11",
      name: "Design review reminder",
      kind: "schedule",
      agentId: "agent-17",
      editorId,
      status: "enabled",
      pool: "member",
      spaceId: "space-3",
      schedule: {
        cron: "30 14 * * 2,4",
        label: "at 2:30 PM, only on Tuesday and Thursday",
        timezone: "Europe/Paris",
      },
      createdAt: daysAgo(35),
      lastRunAt: hoursAgo(19),
    },
    {
      id: "trigger-12",
      name: "Quarterly content audit",
      kind: "schedule",
      agentId: "agent-15",
      editorId,
      status: "enabled",
      pool: "member",
      schedule: {
        cron: "0 9 1 1,4,7,10 *",
        label:
          "at 9:00 AM, on day 1 of the month, only in January, April, July, and October",
        timezone: "Europe/Paris",
      },
      createdAt: daysAgo(180),
      lastRunAt: daysAgo(46),
    },
  ];

  return triggers.map((trigger) => ({
    ...trigger,
    ...(TRIGGER_USAGE[trigger.id] ?? { runCount: 0, credits: 0 }),
  }));
}
