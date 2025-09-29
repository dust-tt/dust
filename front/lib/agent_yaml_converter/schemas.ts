import { z } from "zod";

import { additionalConfigurationSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  MODEL_IDS,
  MODEL_PROVIDER_IDS,
  REASONING_EFFORT_IDS,
} from "@app/types/assistant/assistant";

const agentYAMLBasicInfoSchema = z.object({
  handle: z.string().min(1, "Handle is required"),
  description: z.string().min(1, "Description is required"),
  scope: z.enum(["visible", "hidden"]),
  avatar_url: z.string().url("Invalid avatar URL").optional(),
  max_steps_per_run: z.number().min(1, "Max steps per run must be at least 1"),
  visualization_enabled: z.boolean(),
});

const agentYAMLGenerationSettingsSchema = z.object({
  model_id: z.enum(MODEL_IDS),
  provider_id: z.enum(MODEL_PROVIDER_IDS),
  temperature: z.number().min(0).max(1, "Temperature must be between 0 and 1"),
  reasoning_effort: z.enum(REASONING_EFFORT_IDS),
  response_format: z.string().optional(),
});

const agentYAMLTagSchema = z.object({
  name: z.string().min(1, "Tag name is required"),
  kind: z.enum(["standard", "protected"]),
});

const agentYAMLEditorSchema = z.object({
  user_id: z.string().min(1, "User ID is required"),
  email: z.string().email("Invalid email address"),
  full_name: z.string().min(1, "Full name is required"),
});

const agentYAMLTimeFrameSchema = z
  .object({
    duration: z.number().min(1, "Duration must be at least 1"),
    unit: z.enum(["hour", "day", "week", "month", "year"]),
  })
  .nullable();

const agentYAMLTagsFilterSchema = z.object({
  in: z.array(z.string()),
  not: z.array(z.string()),
  mode: z.enum(["custom", "auto"]),
});

const agentYAMLDataSourceConfigurationSchema = z.object({
  view_id: z.string().min(1, "View ID is required"),
  selected_resources: z.array(z.string()),
  is_select_all: z.boolean(),
  tags_filter: agentYAMLTagsFilterSchema.nullable(),
});

const baseAgentYAMLActionSchema = z.object({
  name: z.string().min(1, "Action name is required"),
  description: z.string().min(1, "Action description is required"),
});

/**
 * Base Data Source Action Configuration
 * Common configuration for actions that work with data sources
 */
const baseDataSourceActionConfigurationSchema = z.object({
  data_sources: z.record(z.string(), agentYAMLDataSourceConfigurationSchema),
});

const timeFrameActionConfigurationSchema =
  baseDataSourceActionConfigurationSchema.extend({
    time_frame: agentYAMLTimeFrameSchema,
  });

/**
 * YAML Action Schemas
 */
const agentYAMLDataVisualizationActionSchema = baseAgentYAMLActionSchema.extend(
  {
    type: z.literal("DATA_VISUALIZATION"),
    configuration: z.object({}), // Empty configuration
  }
);

const agentYAMLReasoningModelSchema = z
  .object({
    model_id: z.enum(MODEL_IDS),
    provider_id: z.enum(MODEL_PROVIDER_IDS),
    temperature: z.number().min(0).max(1).nullable().optional(),
    reasoning_effort: z.enum(REASONING_EFFORT_IDS).nullable().optional(),
  })
  .nullable();

const agentYAMLMCPActionSchema = baseAgentYAMLActionSchema.extend({
  type: z.literal("MCP"),
  configuration: z.object({
    mcp_server_name: z.string(),
    data_sources: z
      .record(z.string(), agentYAMLDataSourceConfigurationSchema)
      .optional(),
    time_frame: agentYAMLTimeFrameSchema.optional(),
    json_schema: z.object({}).nullable().optional(),
    reasoning_model: agentYAMLReasoningModelSchema.optional(),
    additional_configuration: additionalConfigurationSchema.optional(),
  }),
});

const agentYAMLActionSchema = z.discriminatedUnion("type", [
  agentYAMLDataVisualizationActionSchema,
  agentYAMLMCPActionSchema,
]);

const agentYAMLSlackIntegrationSchema = z.object({
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
