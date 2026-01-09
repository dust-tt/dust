import { z } from "zod";

import type { OAuthCredentials } from "@app/types";

export const MCP_SERVER_OAUTH_USE_CASES = [
  "platform_actions",
  "personal_actions",
] as const;

export const mcpServerOAuthFormSchema = z.object({
  useCase: z.enum(MCP_SERVER_OAUTH_USE_CASES).nullable().default(null),
  authCredentials: z.custom<OAuthCredentials>().nullable().default(null),
  oauthFormValid: z.boolean().default(true),
});

export type MCPServerOAuthFormValues = z.infer<typeof mcpServerOAuthFormSchema>;

export const CREATE_MCP_SERVER_AUTH_METHODS = [
  "oauth-dynamic",
  "oauth-static",
  "bearer",
] as const;

export type CreateMCPServerAuthMethod =
  (typeof CREATE_MCP_SERVER_AUTH_METHODS)[number];

export const DEFAULT_CREATE_MCP_SERVER_AUTH_METHOD: CreateMCPServerAuthMethod =
  "oauth-dynamic";

export const createMCPServerDialogFormSchema = mcpServerOAuthFormSchema.extend({
  remoteServerUrl: z.string().default(""),
  authMethod: z
    .enum(CREATE_MCP_SERVER_AUTH_METHODS)
    .default(DEFAULT_CREATE_MCP_SERVER_AUTH_METHOD),
  sharedSecret: z.string().optional(),
  useCustomHeaders: z.boolean().default(false),
  customHeaders: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .default([]),
});

export type CreateMCPServerDialogFormValues = z.infer<
  typeof createMCPServerDialogFormSchema
>;
