import { z } from "zod";

import {
  MODEL_IDS,
  MODEL_PROVIDER_IDS,
  REASONING_EFFORT_IDS,
} from "@app/types/assistant/assistant";

export const agentYAMLMetadataSchema = z.object({
  version: z.string().min(1, "Version is required"),
  agent_id: z.string().min(1, "Agent ID is required"),
  last_modified: z.string().datetime("Invalid date format"),
  created_by: z.string().min(1, "Created by is required"),
});

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
  reasoning_effort: z.enum(REASONING_EFFORT_IDS),
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

export const baseAgentYAMLActionSchema = z.object({
  id: z.string().min(1, "Action ID is required"),
  name: z.string().min(1, "Action name is required"),
  description: z.string().min(1, "Action description is required"),
});

/**
 * Base Data Source Action Configuration
 * Common configuration for actions that work with data sources
 */
export const baseDataSourceActionConfigurationSchema = z.object({
  data_sources: z.record(z.string(), agentYAMLDataSourceConfigurationSchema),
});

export const timeFrameActionConfigurationSchema =
  baseDataSourceActionConfigurationSchema.extend({
    time_frame: agentYAMLTimeFrameSchema,
  });

/**
 * YAML Action Schemas
 * Each action type extends the base schema with specific configuration
 */
export const agentYAMLSearchActionSchema = baseAgentYAMLActionSchema.extend({
  type: z.literal("SEARCH"),
  configuration: baseDataSourceActionConfigurationSchema,
});

export const agentYAMLDataVisualizationActionSchema =
  baseAgentYAMLActionSchema.extend({
    type: z.literal("DATA_VISUALIZATION"),
    configuration: z.object({}), // Empty configuration
  });

export const agentYAMLIncludeDataActionSchema =
  baseAgentYAMLActionSchema.extend({
    type: z.literal("INCLUDE_DATA"),
    configuration: timeFrameActionConfigurationSchema,
  });

export const agentYAMLExtractDataActionSchema =
  baseAgentYAMLActionSchema.extend({
    type: z.literal("EXTRACT_DATA"),
    configuration: timeFrameActionConfigurationSchema.extend({
      json_schema: z.object({}).nullable(),
    }),
  });

export const agentYAMLQueryTablesActionSchema =
  baseAgentYAMLActionSchema.extend({
    type: z.literal("QUERY_TABLES"),
    configuration: timeFrameActionConfigurationSchema,
  });

export const agentYAMLActionSchema = z.discriminatedUnion("type", [
  agentYAMLSearchActionSchema,
  agentYAMLDataVisualizationActionSchema,
  agentYAMLIncludeDataActionSchema,
  agentYAMLExtractDataActionSchema,
  agentYAMLQueryTablesActionSchema,
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

/**
 * Complete YAML Configuration Schema
 * The main schema that validates the entire YAML structure
 */
export const agentYAMLConfigSchema = z.object({
  metadata: agentYAMLMetadataSchema,
  agent: agentYAMLBasicInfoSchema,
  instructions: z.string().min(1, "Instructions are required"),
  generation_settings: agentYAMLGenerationSettingsSchema,
  tags: z.array(agentYAMLTagSchema),
  editors: z.array(agentYAMLEditorSchema),
  toolset: z.array(agentYAMLActionSchema),
  slack_integration: agentYAMLSlackIntegrationSchema.optional(),
});

export type AgentYAMLTag = z.infer<typeof agentYAMLTagSchema>;
export type AgentYAMLEditor = z.infer<typeof agentYAMLEditorSchema>;
export type AgentYAMLDataSourceConfiguration = z.infer<
  typeof agentYAMLDataSourceConfigurationSchema
>;

export type AgentYAMLAction = z.infer<typeof agentYAMLActionSchema>;
export type AgentYAMLSlackIntegration = z.infer<
  typeof agentYAMLSlackIntegrationSchema
>;
export type AgentYAMLConfig = z.infer<typeof agentYAMLConfigSchema>;
