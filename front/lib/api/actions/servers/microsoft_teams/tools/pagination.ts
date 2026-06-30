import type { TeamsMessage } from "@app/lib/api/actions/servers/microsoft/utils";

// Max messages returned by list_messages. This is the primary ceiling on the
// context we hand back to the model.
export const MAX_NUMBER_OF_MESSAGES = 200;

// Page size requested from Microsoft Graph (its documented maximum for both the
// chat and channel message endpoints).
export const MESSAGES_PAGE_SIZE = 50;

// Operational backstop on how many messages we'll scan in a single
// list_messages call. The channel endpoint supports no server-side date
// filtering, so a range whose upper bound (toDate) is in the past forces a
// newest-first walk through history until we reach the window. This is NOT a
// results limit (that's MAX_NUMBER_OF_MESSAGES) — it only guards against a
// runaway loop / Graph throttling on very large channels, and is surfaced to
// the caller when hit so they can narrow the range. Set high so it does not
// truncate legitimate deep-history retrieval.
export const MAX_MESSAGES_TO_SCAN = 10_000;

// The timestamp Graph sorts the page by. The stop decision must compare against
// the *ordering* field, not the date-range filter field: only the ordering
// field guarantees that later pages are strictly older. Chats can be ordered by
// createdDateTime; channels are always ordered by lastModifiedDateTime (reply
// chain) and cannot be changed.
export type MessageOrderingField = "createdDateTime" | "lastModifiedDateTime";

// Decide whether to fetch another page after processing the page just received.
// Pure (no I/O, no shared state) so the stopping logic can be unit-tested — this
// is where the past-toDate early-exit bug lived.
//
// Graph returns messages newest-first, so the last message on a page is the
// oldest by `orderingField`. Messages outside the range are skipped by the
// caller's filter, not a reason to stop. We keep paging until the oldest message
// on the page is older than fromDate (every later, older page would then be out
// of range too), or we have collected the message limit. With no lower bound,
// page until the limit.
export function shouldContinuePagination({
  pageMessages,
  fromDateTime,
  collectedCount,
  orderingField,
}: {
  pageMessages: readonly Pick<TeamsMessage, MessageOrderingField>[] | undefined;
  fromDateTime: Date | null;
  collectedCount: number;
  orderingField: MessageOrderingField;
}): boolean {
  if (collectedCount >= MAX_NUMBER_OF_MESSAGES) {
    return false;
  }

  // Empty page (e.g. a server-side filter matched nothing on this skiptoken
  // page): nothing to learn from it; keep following nextLink if there is one.
  if (!pageMessages || pageMessages.length === 0) {
    return true;
  }

  const oldestMessageOnPage = pageMessages[pageMessages.length - 1];
  if (!fromDateTime || !oldestMessageOnPage) {
    return true;
  }

  return new Date(oldestMessageOnPage[orderingField]) >= fromDateTime;
}
