import { additionalConfigurationSchema } from "@app/components/shared/tools_picker/types";
import { MODEL_IDS } from "@app/types/assistant/models/models";
import { MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import { REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";
import { z } from "zod";

export const agentYAMLBasicInfoSchema = z.object({
  handle: z.string().min(1, "Handle is required"),
  description: z.string().min(1, "Description is required"),
  scope: z.enum(["visible", "hidden"]),
  avatar_url: z.string().url("Invalid avatar URL").optional(),
  max_steps_per_run: z.number().min(1, "Max steps per run must be at least 1"),
  visualization_enabled: z.boolean(),
});

export const agentYAMLGenerationSettingsSchema = z.object({
  model_id: z.enum(MODEL_IDS),
  provider_id: z.enum(MODEL_PROVIDER_IDS),
  temperature: z.number().min(0).max(1, "Temperature must be between 0 and 1"),
  reasoning_effort: z.enum(REASONING_EFFORTS),
  response_format: z.string().optional(),
});

export const agentYAMLTagSchema = z.object({
  name: z.string().min(1, "Tag name is required"),
  kind: z.enum(["standard", "protected"]),
});

export const agentYAMLEditorSchema = z.object({
  user_id: z.string().min(1, "User ID is required"),
  email: z.string().email("Invalid email address"),
  full_name: z.string().min(1, "Full name is required"),
});

export const agentYAMLTimeFrameSchema = z
  .object({
    duration: z.number().min(1, "Duration must be at least 1"),
    unit: z.enum(["hour", "day", "week", "month", "year"]),
  })
  .nullable();

export const agentYAMLTagsFilterSchema = z.object({
  in: z.array(z.string()),
  not: z.array(z.string()),
  mode: z.enum(["custom", "auto"]),
});

export const agentYAMLDataSourceConfigurationSchema = z.object({
  view_id: z.string().min(1, "View ID is required"),
  selected_resources: z.array(z.string()),
  is_select_all: z.boolean(),
  tags_filter: agentYAMLTagsFilterSchema.nullable(),
});

export const agentYAMLTableConfigurationSchema = z.object({
  view_id: z.string().min(1, "View ID is required"),
  table_id: z.string().min(1, "Table ID is required"),
});

export const agentYAMLDustAppConfigurationSchema = z.object({
  type: z.literal("dust_app_run_configuration"),
  app_workspace_id: z.string(),
  app_id: z.string(),
});

export const agentYAMLProjectConfigurationSchema = z.object({
  workspace_id: z.string(),
  project_id: z.string(),
});

export const agentYAMLMCPActionSchema = z.object({
  name: z.string().min(1, "Action name is required"),
  description: z.string().min(1, "Action description is required"),
  type: z.literal("MCP"),
  configuration: z.object({
    mcp_server_name: z.string(),
    data_sources: z
      .record(z.string(), agentYAMLDataSourceConfigurationSchema)
      .optional(),
    tables: z.array(agentYAMLTableConfigurationSchema).nullable().optional(),
    child_agent_id: z.string().nullable().optional(),
    time_frame: agentYAMLTimeFrameSchema.optional(),
    json_schema: z.object({}).nullable().optional(),
    additional_configuration: additionalConfigurationSchema.optional(),
    dust_app_configuration: agentYAMLDustAppConfigurationSchema
      .nullable()
      .optional(),
    secret_name: z.string().nullable().optional(),
    dust_project: agentYAMLProjectConfigurationSchema.nullable().optional(),
  }),
});

export const agentYAMLActionSchema = z.discriminatedUnion("type", [
  agentYAMLMCPActionSchema,
]);

export const agentYAMLSlackIntegrationSchema = z.object({
  provider: z.enum(["slack", "slack_bot"]).nullable(),
  channels: z.array(
    z.object({
      channel_id: z.string().min(1, "Channel ID is required"),
      channel_name: z.string().min(1, "Channel name is required"),
    })
  ),
});

export const agentYAMLSkillSchema = z.object({
  sId: z.string().min(1, "Skill ID is required"),
  name: z.string().min(1, "Skill name is required"),
});

export const agentYAMLSpaceSchema = z.object({
  space_id: z.string().min(1, "Space ID is required"),
  name: z.string().min(1, "Space name is required"),
});

export const agentYAMLConfigSchema = z.object({
  agent: agentYAMLBasicInfoSchema,
  instructions: z.string().min(1, "Instructions are required"),
  generation_settings: agentYAMLGenerationSettingsSchema,
  tags: z.array(agentYAMLTagSchema),
  editors: z.array(agentYAMLEditorSchema),
  toolset: z.array(agentYAMLActionSchema),
  spaces: z.array(agentYAMLSpaceSchema).optional(),
  skills: z.array(agentYAMLSkillSchema).optional(),
  slack_integration: agentYAMLSlackIntegrationSchema.optional(),
});

export type AgentYAMLTag = z.infer<typeof agentYAMLTagSchema>;
export type AgentYAMLEditor = z.infer<typeof agentYAMLEditorSchema>;
export type AgentYAMLDataSourceConfiguration = z.infer<
  typeof agentYAMLDataSourceConfigurationSchema
>;
export type AgentYAMLTableConfiguration = z.infer<
  typeof agentYAMLTableConfigurationSchema
>;
export type AgentYAMLAction = z.infer<typeof agentYAMLActionSchema>;
export type AgentYAMLSkill = z.infer<typeof agentYAMLSkillSchema>;
export type AgentYAMLSpace = z.infer<typeof agentYAMLSpaceSchema>;
export type AgentYAMLSlackIntegration = z.infer<
  typeof agentYAMLSlackIntegrationSchema
>;
export type AgentYAMLConfig = z.infer<typeof agentYAMLConfigSchema>;
