import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { z } from "zod";

export const SearchQuerySchema = z.object({
  query: z.string().min(1, "Query is required"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

export type SemanticSearchConversationsResponseBody = {
  conversations: Array<ConversationWithoutContentType & { spaceName: string }>;
};
