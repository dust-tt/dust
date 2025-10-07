import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export type ConfluenceErrorResult = string;
export type WithAuthParams = {
  authInfo?: AuthInfo;
  action: (baseUrl: string, accessToken: string) => Promise<CallToolResult>;
};

// Schema for Atlassian resource information
export const AtlassianResourceSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    scopes: z.array(z.string()).optional(),
    avatarUrl: z.string().optional(),
  })
);

export const ConfluenceCurrentUserSchema = z.object({
  account_id: z.string(),
  account_type: z.string().optional().default("atlassian"),
  email: z.string().optional(),
  name: z.string(),
  nickname: z.string().optional(),
});
export type ConfluenceCurrentUser = z.infer<typeof ConfluenceCurrentUserSchema>;
