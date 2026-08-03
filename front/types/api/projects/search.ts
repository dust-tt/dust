import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { z } from "zod";

export const SearchConversationsQuerySchema = z.object({
  query: z.string().min(1, "Query parameter is required and cannot be empty"),
  limit: z.coerce
    .number()
    .int()
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must be at most 100")
    .optional()
    .default(10),
});

export type SearchConversationsResponseBody = {
  conversations: ConversationWithoutContentType[];
};
