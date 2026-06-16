import type { MCPServerViewType } from "@app/lib/api/mcp";
import { z } from "zod";

export type FetchConversationToolsResponse = {
  tools: MCPServerViewType[];
};

export const ConversationToolActionRequestSchema = z.object({
  action: z.enum(["add", "delete"]),
  mcp_server_view_id: z.string(),
});

export type ConversationToolActionRequest = z.infer<
  typeof ConversationToolActionRequestSchema
>;
