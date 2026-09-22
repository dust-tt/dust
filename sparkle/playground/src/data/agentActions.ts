import {
  BarChart12,
  Calendar,
  DriveLogo,
  Globe01,
  GmailLogo,
  JiraLogo,
  Mail01,
  MessageChatCircle,
  NotionLogo,
  Pencil01,
  SlackLogo,
  Table,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

// What an agent is doing while it works. A conversation at work has nothing to
// report yet — the description still says what was last said — so the row says
// the step the agent is on instead, and moves through the steps for as long as
// the work lasts.

/**
 * A step, which is what is being done and what it is being done with. The icon
 * is the tool the step reaches for — the platform's own mark where there is
 * one, since a row is read at a glance and a logo lands before a sentence does.
 * A step that reaches for nothing goes without: thinking is the agent alone.
 */
export interface AgentAction {
  label: string;
  icon?: ComponentType<{ className?: string }>;
}

/**
 * The steps an agent moves through. They are in no order: a row can be on any
 * of them at any time, and the list only has to read as work being done.
 */
export const AGENT_ACTIONS: AgentAction[] = [
  { label: "Thinking" },
  { label: "Searching the web", icon: Globe01 },
  { label: "Reading your Gmail", icon: GmailLogo },
  { label: "Querying Notion", icon: NotionLogo },
  { label: "Digging through Slack", icon: SlackLogo },
  { label: "Opening a spreadsheet", icon: Table },
  { label: "Running a search in Drive", icon: DriveLogo },
  { label: "Reading the Jira ticket", icon: JiraLogo },
  { label: "Crunching the numbers", icon: BarChart12 },
  { label: "Writing the summary", icon: Pencil01 },
];

/**
 * The beat every working row is read off. It is shorter than a step so rows can
 * fall on different beats; how many beats a step lasts is the row's own.
 */
export const AGENT_ACTION_TICK_MS = 600;

/** A step lasts a few beats — between two and three and a half seconds. */
const MIN_STEP_TICKS = 3;
const STEP_TICKS_SPREAD = 4;

/** A stable number for an id, so a row's rhythm is the same one every render. */
function hashId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index++) {
    hash = (hash * 31 + id.charCodeAt(index)) % 100003;
  }
  return hash;
}

/**
 * What an agent stops to ask you about. These are steps it will not take on
 * its own, so unlike the list above they are not a rhythm: a row waiting on
 * you is not moving, and says the one thing it is waiting to do until you
 * answer.
 */
export const PENDING_ACTIONS: AgentAction[] = [
  { label: "Retrieving a document from Notion", icon: NotionLogo },
  { label: "Sending an email", icon: Mail01 },
  { label: "Posting the summary to Slack", icon: SlackLogo },
  { label: "Updating the Jira ticket", icon: JiraLogo },
  { label: "Sharing the folder in Drive", icon: DriveLogo },
  { label: "Putting an invite in your calendar", icon: Calendar },
  { label: "Adding a row to the spreadsheet", icon: Table },
  { label: "Replying to the customer", icon: MessageChatCircle },
];

/** The step this row's agent is waiting on, the same one every render. */
export function getPendingAction(rowId: string): AgentAction {
  return PENDING_ACTIONS[hashId(rowId) % PENDING_ACTIONS.length];
}

/**
 * @cc [owner:Duncid,label:product] agent-action-stable-per-row
 * The step a row shows MUST follow from its id and the tick alone. A row on an
 * unchanged tick MUST read the same on every render, and two rows on the same
 * tick MUST be free to differ — so the list reads as several agents each doing
 * their own thing rather than one thing repeated down the page.
 */
export function getAgentAction(rowId: string, tick: number): AgentAction {
  const seed = hashId(rowId);
  const stepTicks = MIN_STEP_TICKS + (seed % STEP_TICKS_SPREAD);
  const step = Math.floor((tick + seed) / stepTicks) + seed;

  return AGENT_ACTIONS[step % AGENT_ACTIONS.length];
}
