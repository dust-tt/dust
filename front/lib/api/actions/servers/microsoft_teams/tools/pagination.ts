import type { TeamsMessage } from "@app/lib/api/actions/servers/microsoft/utils";

// Max messages returned by list_messages. This is the primary ceiling on the
// context we hand back to the model.
export const MAX_NUMBER_OF_MESSAGES = 200;

// Page size requested from Microsoft Graph (its documented maximum for both the
// chat and channel message endpoints).
export const MESSAGES_PAGE_SIZE = 50;

// Operational backstop on messages scanned per call — NOT a results limit
// (that's MAX_NUMBER_OF_MESSAGES). Channels can't filter server-side, so a past
// toDate forces a newest-first walk through history; this caps that walk and is
// surfaced to the caller when hit. Set high so it doesn't truncate legitimate
// deep-history retrieval.
export const MAX_MESSAGES_TO_SCAN = 10_000;

// The field Graph orders the page by. The stop decision must compare the
// *ordering* field, not the date-range filter field — only the ordering field
// guarantees later pages are strictly older. Chats can order by createdDateTime;
// channels are always ordered by lastModifiedDateTime (reply chain).
export type MessageOrderingField = "createdDateTime" | "lastModifiedDateTime";

// Pure (no I/O, no shared state) so the stop logic can be unit-tested — this is
// where the past-toDate early-exit bug lived. Pages are newest-first, so we keep
// going until the oldest message (last on the page) predates fromDate, or we've
// hit the message limit; with no lower bound, page until the limit.
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
