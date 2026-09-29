import {
  Calendar,
  DriveLogo,
  JiraLogo,
  Mail01,
  MessageChatCircle,
  NotionLogo,
  SlackLogo,
  Table,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

/**
 * A step, which is what is being done and what it is being done with. The icon
 * is the tool the step reaches for — the platform's own mark where there is
 * one, since a row is read at a glance and a logo lands before a sentence does.
 */
export interface AgentAction {
  label: string;
  icon?: ComponentType<{ className?: string }>;
}

/** A stable number for an id, so a row reads the same one every render. */
function hashId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index++) {
    hash = (hash * 31 + id.charCodeAt(index)) % 100003;
  }
  return hash;
}

/**
 * What an agent stops to ask you about. These are steps it will not take on
 * its own, so a row waiting on you is not moving, and says the one thing it is
 * waiting to do until you answer.
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
