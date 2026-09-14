import type { Conversation, WakeUp, WakeUpSchedule } from "./types";

// The wake-ups an agent set for itself inside a conversation. Unlike a trigger,
// a wake-up is never an event and never opens a conversation of its own: it
// comes back into the one it was set in. The product caps how many times one
// can fire so a recurring wake-up cannot run away.

export const MAX_WAKE_UP_FIRES = 32;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function atTimeOfDay(date: Date, hour: number, minute: number): Date {
  const at = new Date(date);
  at.setHours(hour, minute, 0, 0);
  return at;
}

/** The given time of day, today if it is still ahead, tomorrow otherwise. */
function nextTimeOfDay(hour: number, minute: number, now: Date): Date {
  const today = atTimeOfDay(now, hour, minute);
  return today > now
    ? today
    : atTimeOfDay(new Date(now.getTime() + DAY_MS), hour, minute);
}

function isWeekend(date: Date): boolean {
  return date.getDay() === 0 || date.getDay() === 6;
}

function nextWorkdayTimeOfDay(hour: number, minute: number, now: Date): Date {
  const next = nextTimeOfDay(hour, minute, now);
  while (isWeekend(next)) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function inDaysAtTimeOfDay(
  days: number,
  hour: number,
  minute: number,
  now: Date
): Date {
  return atTimeOfDay(new Date(now.getTime() + days * DAY_MS), hour, minute);
}

/** Far enough out that only its date places it, the way the banner writes it. */
function onDateAtLabel(date: Date): string {
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const time = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `on ${day} at ${time}`;
}

/** The next Monday at the given time; a Monday today still counts as next week. */
function nextMondayTimeOfDay(hour: number, minute: number, now: Date): Date {
  const daysAhead = (1 - now.getDay() + 7) % 7 || 7;
  return atTimeOfDay(
    new Date(now.getTime() + daysAhead * DAY_MS),
    hour,
    minute
  );
}

/**
 * What agents put wake-ups on: something to come back to, a reminder, or a
 * condition to keep watching. Each reads as one sentence with its schedule
 * appended, the way the conversation banner writes it.
 */
const WAKE_UP_TEMPLATES: {
  reason: string;
  fireCount: number;
  schedule: (now: Date) => WakeUpSchedule;
}[] = [
  {
    reason: "Check whether the staging deploy went through",
    fireCount: 0,
    schedule: (now) => ({
      kind: "once",
      label: "at 17:30",
      nextFireAt: nextTimeOfDay(17, 30, now),
    }),
  },
  {
    reason: "Remind you to send the pricing deck",
    fireCount: 0,
    schedule: (now) => ({
      kind: "once",
      label: "tomorrow at 09:00",
      nextFireAt: atTimeOfDay(new Date(now.getTime() + DAY_MS), 9, 0),
    }),
  },
  {
    reason: "Poll the incident channel until it clears",
    fireCount: 6,
    schedule: (now) => ({
      kind: "recurring",
      label: "every 15 minutes",
      nextFireAt: new Date(now.getTime() + 9 * MINUTE_MS),
    }),
  },
  {
    reason: "Follow up on the Zendesk escalation",
    fireCount: 3,
    schedule: (now) => ({
      kind: "recurring",
      label: "every weekday at 09:15",
      nextFireAt: nextWorkdayTimeOfDay(9, 15, now),
    }),
  },
  {
    reason: "Check back on the Series C data room",
    fireCount: 0,
    schedule: (now) => ({
      kind: "once",
      label: "on Monday at 08:00",
      nextFireAt: nextMondayTimeOfDay(8, 0, now),
    }),
  },
  {
    reason: "Check whether the renewal was signed",
    fireCount: 0,
    schedule: (now) => {
      const nextFireAt = inDaysAtTimeOfDay(18, 9, 0, now);
      return { kind: "once", label: onDateAtLabel(nextFireAt), nextFireAt };
    },
  },
  {
    reason: "Revisit the hiring plan once the quarter closes",
    fireCount: 0,
    schedule: (now) => {
      const nextFireAt = inDaysAtTimeOfDay(46, 10, 30, now);
      return { kind: "once", label: onDateAtLabel(nextFireAt), nextFireAt };
    },
  },
];

/**
 * One wake-up per conversation at most, since the product only allows a single
 * active one at a time, and only in conversations that have an agent in them —
 * a wake-up is the agent scheduling itself, so there is nothing to wake up
 * otherwise. Trigger runs are left out: nobody is in them to be woken back to.
 */
export function createMockWakeUps(
  conversations: Conversation[],
  userId: string
): WakeUp[] {
  const now = new Date();
  const candidates = conversations.filter(
    (conversation) =>
      conversation.agentParticipants.length > 0 &&
      conversation.triggerId === undefined
  );

  return WAKE_UP_TEMPLATES.flatMap((template, index) => {
    const conversation = candidates[index];
    if (!conversation) {
      return [];
    }

    return [
      {
        id: `wakeup-${index + 1}`,
        conversationId: conversation.id,
        agentId: conversation.agentParticipants[0],
        userId,
        reason: template.reason,
        schedule: template.schedule(now),
        fireCount: template.fireCount,
        maxFires: MAX_WAKE_UP_FIRES,
        createdAt: new Date(now.getTime() - (index + 1) * 37 * MINUTE_MS),
      },
    ];
  });
}

/** Why it will fire and when, as one sentence, the way the banner reads it. */
export function getWakeUpDescription(wakeUp: WakeUp): string {
  return `${wakeUp.reason} ${wakeUp.schedule.label}`;
}
