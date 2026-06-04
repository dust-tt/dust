import {
  CUSTOM_RESOURCE_ALLOWED,
  INTERNAL_ALLOWED_ICONS,
} from "@app/components/resources/resources_icon_names";
import { MCP_TOOL_STAKE_LEVELS } from "@app/lib/actions/constants";
import { MCP_SERVER_AVAILABILITY } from "@app/lib/actions/mcp_internal_actions/constants";
import { OAUTH_PROVIDERS } from "@app/types/oauth/lib";
import { DbModelIdSchema } from "@app/types/shared/model_id";
import { EditedByUserSchema } from "@app/types/user";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";

const MCP_OAUTH_USE_CASES = ["platform_actions", "personal_actions"] as const;

export const ToolDisplayLabelsSchema = z.object({
  running: z.string(),
  done: z.string(),
});

export const EditableToolConfigSchema = z.object({
  isEditable: z.boolean(),
  editableArguments: z.array(z.string()),
});

// Types are kept in lib/api/mcp.ts to avoid breaking the Temporal bundle.
// Only schemas are exported from this file.

export const MCPToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.custom<JSONSchema>().optional(),
  displayLabels: ToolDisplayLabelsSchema.optional(),
  editable: EditableToolConfigSchema.optional(),
});

const AuthorizationInfoSchema = z.object({
  provider: z.enum(OAUTH_PROVIDERS),
  supported_use_cases: z.array(z.enum(MCP_OAUTH_USE_CASES)),
  scope: z.string().optional(),
  workspace_connection: z
    .object({
      required: z.boolean(),
      satisfied: z.boolean(),
    })
    .optional(),
});

export const MCPServerSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  sId: z.string(),
  icon: z.enum([...CUSTOM_RESOURCE_ALLOWED, ...INTERNAL_ALLOWED_ICONS]),
  authorization: AuthorizationInfoSchema.nullable(),
  tools: z.array(MCPToolSchema),
  availability: z.enum(MCP_SERVER_AVAILABILITY),
  allowMultipleInstances: z.boolean(),
  documentationUrl: z.string().nullable(),
  developerSecretSelection: z
    .enum(["required", "optional"])
    .nullable()
    .optional(),
  developerSecretSelectionDescription: z.string().nullable().optional(),
  sharedSecret: z.string().nullable().optional(),
  customHeaders: z.record(z.string(), z.string()).nullable().optional(),
});

const ToolsMetadataSchema = z.object({
  toolName: z.string(),
  permission: z.enum(MCP_TOOL_STAKE_LEVELS),
  enabled: z.boolean(),
});

export const MCPServerViewSchema = z.object({
  id: DbModelIdSchema,
  sId: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  spaceId: z.string(),
  serverType: z.enum(["remote", "internal"]),
  server: MCPServerSchema,
  oAuthUseCase: z.enum(MCP_OAUTH_USE_CASES).nullable(),
  editedByUser: EditedByUserSchema.nullable(),
  toolsMetadata: z.array(ToolsMetadataSchema).optional(),
});

export const PostRequestActionsAccessBodySchema = z.object({
  emailMessage: z.string(),
  mcpServerViewId: z.string(),
});

export const PatchMCPServerBodySchema = z
  .object({
    icon: z.string(),
  })
  .or(
    z
      .object({
        sharedSecret: z.string().optional(),
        customHeaders: z
          .array(z.object({ key: z.string(), value: z.string() }))
          .nullable()
          .optional(),
      })
      .refine(
        (data) =>
          data.sharedSecret !== undefined || data.customHeaders !== undefined,
        {
          message: "Either sharedSecret or customHeaders must be provided",
        }
      )
  )
  .or(
    z.object({
      meta: z.record(z.string(), z.string()).nullable(),
    })
  );

export const UpdateMCPToolSettingsBodySchema = z
  .object({
    permission: z.enum(MCP_TOOL_STAKE_LEVELS).optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (data) => data.permission !== undefined || data.enabled !== undefined,
    {
      message: "At least one of 'permission' or 'enabled' must be provided.",
    }
  );
