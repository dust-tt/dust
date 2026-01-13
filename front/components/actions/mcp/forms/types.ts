import { z } from "zod";

import { validateUrl } from "@app/types";

// OAuth use cases
export const MCP_SERVER_OAUTH_USE_CASES = [
  "platform_actions",
  "personal_actions",
] as const;

export type MCPServerOAuthUseCase = (typeof MCP_SERVER_OAUTH_USE_CASES)[number];

// Auth methods
export const CREATE_MCP_SERVER_AUTH_METHODS = [
  "oauth-dynamic",
  "oauth-static",
  "bearer",
] as const;

export type CreateMCPServerAuthMethod =
  (typeof CREATE_MCP_SERVER_AUTH_METHODS)[number];

export const DEFAULT_CREATE_MCP_SERVER_AUTH_METHOD: CreateMCPServerAuthMethod =
  "oauth-dynamic";

// Validator helper
const isValidClientIdOrSecret = (s: string): boolean =>
  typeof s === "string" && s.trim().length > 0;

// OAuth credentials schema - pre-defined fields for mcp_static provider
export const mcpServerOAuthCredentialsSchema = z.object({
  client_id: z.string().default(""),
  client_secret: z.string().optional(), // Optional for PKCE flows
  token_endpoint: z.string().default(""),
  authorization_endpoint: z.string().default(""),
  scope: z.string().optional(),
});

export type MCPServerOAuthCredentials = z.infer<
  typeof mcpServerOAuthCredentialsSchema
>;

// Base OAuth form schema (used by ConnectMCPServerDialog)
export const mcpServerOAuthFormSchema = z.object({
  useCase: z.enum(MCP_SERVER_OAUTH_USE_CASES).nullable().default(null),
  oauthCredentials: mcpServerOAuthCredentialsSchema.default({}),
});

export type MCPServerOAuthFormValues = z.infer<typeof mcpServerOAuthFormSchema>;

// Main form schema with cross-field validation (used by CreateMCPServerDialog)
const baseCreateMCPServerDialogFormSchema = z.object({
  remoteServerUrl: z.string().default(""),
  authMethod: z
    .enum(CREATE_MCP_SERVER_AUTH_METHODS)
    .default(DEFAULT_CREATE_MCP_SERVER_AUTH_METHOD),
  sharedSecret: z.string().optional(),
  useCustomHeaders: z.boolean().default(false),
  customHeaders: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .default([]),
  // OAuth fields
  useCase: z.enum(MCP_SERVER_OAUTH_USE_CASES).nullable().default(null),
  oauthCredentials: mcpServerOAuthCredentialsSchema.default({}),
});

export const createMCPServerDialogFormSchema =
  baseCreateMCPServerDialogFormSchema.superRefine((data, ctx) => {
    // URL validation (when URL is provided)
    if (data.remoteServerUrl && !validateUrl(data.remoteServerUrl).valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c)",
        path: ["remoteServerUrl"],
      });
    }

    // Bearer token required when authMethod is "bearer"
    if (data.authMethod === "bearer" && !data.sharedSecret?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Bearer token is required",
        path: ["sharedSecret"],
      });
    }

    // Static OAuth credential validation (when authMethod is "oauth-static")
    if (data.authMethod === "oauth-static") {
      if (!data.useCase) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please select a use case",
          path: ["useCase"],
        });
      }
      if (!isValidClientIdOrSecret(data.oauthCredentials.client_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Client ID is required",
          path: ["oauthCredentials", "client_id"],
        });
      }
      if (!validateUrl(data.oauthCredentials.token_endpoint).valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Valid token endpoint URL is required",
          path: ["oauthCredentials", "token_endpoint"],
        });
      }
      if (!validateUrl(data.oauthCredentials.authorization_endpoint).valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Valid authorization endpoint URL is required",
          path: ["oauthCredentials", "authorization_endpoint"],
        });
      }
    }
  });

export type CreateMCPServerDialogFormValues = z.infer<
  typeof baseCreateMCPServerDialogFormSchema
>;
