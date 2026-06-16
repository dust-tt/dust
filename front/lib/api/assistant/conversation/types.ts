// Contract types (request/response bodies) for the assistant conversation API
// endpoints. Used by the assistant conversation API routes under
// `front-api/routes` so there is a single source of truth.

import type {
  ConversationListItemType,
  ConversationType,
  ConversationWithoutContentType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { z } from "zod";

export type GetConversationsResponseBody = {
  conversations: ConversationListItemType[];
  hasMore: boolean;
  lastValue: string | null;
};

export type PostConversationsResponseBody = {
  conversation: ConversationType;
  message?: UserMessageType;
  contentFragments: ContentFragmentType[];
};

export const PatchConversationsRequestBodySchema = z.union([
  z.object({
    title: z.string(),
  }),
  z.object({
    read: z.boolean(),
  }),
  z.object({
    spaceId: z.string(),
  }),
  z.object({
    accessMode: z.enum(["participants_only", "workspace_members"]),
  }),
  z.object({
    removeFromProject: z.literal(true),
  }),
]);

export type PatchConversationsRequestBody = z.infer<
  typeof PatchConversationsRequestBodySchema
>;

export type GetConversationResponseBody = {
  conversation: ConversationWithoutContentType;
};

export type PatchConversationResponseBody = {
  success: boolean;
};
