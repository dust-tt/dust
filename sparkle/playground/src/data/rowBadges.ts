import { Cube01, MessageQuestionCircle, Zap } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

import type { AvatarCounterVariantType } from "../components/AvatarCounter";
import { getRequestTypeIcon, REQUEST_TYPE_LABELS } from "./requests";
import type { AdminRequest, Conversation } from "./types";

// What a list row wears on its avatar. A badge answers the question its list
// leaves open, so the same row can wear a different one from one list to the
// next: the Inbox mixes kinds of work and says which this is, while a list of
// nothing but requests has that settled and says which kind of request.

export interface RowBadge {
  icon: ComponentType<{ className?: string }>;
  /** Accessible name for the badge, which the icon alone does not carry. */
  label: string;
}

/**
 * @cc [owner:Duncid,label:product] row-badge-one-treatment
 * Every badge worn on an avatar MUST be drawn with this variant, whatever the
 * row is about. A badge names a category and stops there; a coloured one reads
 * as a row singled out, and singling a row out belongs to the counter in the
 * timestamp slot.
 */
export const ROW_BADGE_VARIANT: AvatarCounterVariantType = "outline";

/** One badge per kind of work the Inbox holds, whatever each row is about. */
export const INBOX_ROW_BADGES: Record<
  "automated" | "request" | "pod",
  RowBadge
> = {
  automated: { icon: Zap, label: "Automated" },
  request: { icon: MessageQuestionCircle, label: "Request" },
  pod: { icon: Cube01, label: "Pod conversation" },
};

/**
 * A conversation wears the Pod it belongs to. A conversation of your own wears
 * nothing: it is the plain case, and the one that needs no explaining.
 */
export function getConversationBadge(
  conversation: Conversation
): RowBadge | undefined {
  return conversation.spaceId ? INBOX_ROW_BADGES.pod : undefined;
}

/** What a request wears where every row is one already: its type. */
export function getRequestTypeBadge(request: AdminRequest): RowBadge {
  return {
    icon: getRequestTypeIcon(request.type),
    label: REQUEST_TYPE_LABELS[request.type],
  };
}
