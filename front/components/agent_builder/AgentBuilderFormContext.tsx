import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";

import type { DataSourceViewContentNode, DataSourceViewType } from "@app/types";
import {
  MODEL_IDS,
  MODEL_PROVIDER_IDS,
  REASONING_EFFORT_IDS,
} from "@app/types/assistant/assistant";

const modelIdSchema = z.enum(MODEL_IDS);
const providerIdSchema = z.enum(MODEL_PROVIDER_IDS);
const reasoningEffortSchema = z.enum(REASONING_EFFORT_IDS);

const supportedModelSchema = z.object({
  modelId: modelIdSchema,
  providerId: providerIdSchema,
});

export const generationSettingsSchema = z.object({
  modelSettings: supportedModelSchema,
  temperature: z.number().min(0).max(1),
  reasoningEffort: reasoningEffortSchema,
  responseFormat: z.string().optional(),
});

export type AgentBuilderGenerationSettings = z.infer<
  typeof generationSettingsSchema
>;

const tagsFilterSchema = z
  .object({
    in: z.array(z.string()),
    not: z.array(z.string()),
    mode: z.enum(["custom", "auto"]),
  })
  .nullable();

const dataSourceViewSelectionConfigurationSchema = z.object({
  dataSourceView: z.custom<DataSourceViewType>(),
  selectedResources: z.array(z.custom<DataSourceViewContentNode>()),
  isSelectAll: z.boolean(),
  tagsFilter: tagsFilterSchema,
});

const searchActionConfigurationSchema = z.object({
  type: z.literal("SEARCH"),
  dataSourceConfigurations: z.record(
    z.string(),
    dataSourceViewSelectionConfigurationSchema
  ),
});

const timeFrameSchema = z
  .object({
    duration: z.number().min(1),
    unit: z.enum(["hour", "day", "week", "month", "year"]),
  })
  .nullable();

const includeDataActionConfigurationSchema = z.object({
  type: z.literal("INCLUDE_DATA"),
  dataSourceConfigurations: z.record(
    z.string(),
    dataSourceViewSelectionConfigurationSchema
  ),
  timeFrame: timeFrameSchema,
});

const extractDataActionConfigurationSchema = z.object({
  type: z.literal("EXTRACT_DATA"),
  dataSourceConfigurations: z.record(
    z.string(),
    dataSourceViewSelectionConfigurationSchema
  ),
  timeFrame: timeFrameSchema,
  jsonSchema: z.custom<JSONSchema>().nullable(),
});

const queryTablesActionConfigurationSchema = z.object({
  type: z.literal("QUERY_TABLES"),
  dataSourceConfigurations: z.record(
    z.string(),
    dataSourceViewSelectionConfigurationSchema
  ),
  timeFrame: timeFrameSchema,
});

const baseActionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  noConfigurationRequired: z.boolean(),
});

const TAG_KINDS = z.union([z.literal("standard"), z.literal("protected")]);

const tagSchema = z.object({
  sId: z.string(),
  name: z.string(),
  kind: TAG_KINDS,
});

const searchActionSchema = baseActionSchema.extend({
  type: z.literal("SEARCH"),
  configuration: searchActionConfigurationSchema,
});

const dataVisualizationActionSchema = baseActionSchema.extend({
  type: z.literal("DATA_VISUALIZATION"),
  configuration: z.null(),
});

const reasoningModelConfigurationSchema = z.object({
  providerId: z.string(),
  modelId: z.string(),
  temperature: z.number().nullable(),
  reasoningEffort: z.string().nullable(),
});

const dustAppRunConfigurationSchema = z.object({
  appWorkspaceId: z.string(),
  appId: z.string(),
});

const mcpServerConfigurationSchema = z.object({
  mcpServerViewId: z.string(),
  dataSourceConfigurations: dataSourceViewSelectionConfigurationSchema,
  tablesConfigurations: dataSourceViewSelectionConfigurationSchema,
  childAgentId: z.string().nullable(),
  reasoningModel: reasoningModelConfigurationSchema.nullable(),
  timeFrame: timeFrameSchema,
  additionalConfiguration: z.record(
    z.union([z.boolean(), z.number(), z.string()])
  ),
  dustAppConfiguration: dustAppRunConfigurationSchema.nullable(),
  jsonSchema: z.custom<JSONSchema>().nullable(),
  _jsonSchemaString: z.string().nullable(),
});

const mcpActionSchema = baseActionSchema.extend({
  type: z.literal("MCP"),
  configuration: mcpServerConfigurationSchema,
});

const includeDataActionSchema = baseActionSchema.extend({
  type: z.literal("INCLUDE_DATA"),
  configuration: includeDataActionConfigurationSchema,
});

const extractDataActionSchema = baseActionSchema.extend({
  type: z.literal("EXTRACT_DATA"),
  configuration: extractDataActionConfigurationSchema,
});

const queryTablesActionSchema = baseActionSchema.extend({
  type: z.literal("QUERY_TABLES"),
  configuration: queryTablesActionConfigurationSchema,
});

// TODO: the goal is to have only two schema: mcpActionSchema and dataVizSchema.
const actionSchema = z.discriminatedUnion("type", [
  searchActionSchema,
  dataVisualizationActionSchema,
  includeDataActionSchema,
  extractDataActionSchema,
  queryTablesActionSchema,
  mcpActionSchema,
]);

const userSchema = z.object({
  sId: z.string(),
  id: z.number(),
  createdAt: z.number(),
  provider: z
    .enum(["auth0", "github", "google", "okta", "samlp", "waad"])
    .nullable(),
  username: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  fullName: z.string(),
  image: z.string().nullable(),
  lastLoginAt: z.number().nullable(),
});

const agentSettingsSchema = z.object({
  name: z.string().min(1, "Agent name is required"),
  description: z.string().min(1, "Agent description is required"),
  pictureUrl: z.string().optional(),
  scope: z.enum(["hidden", "visible"]),
  editors: z.array(userSchema),
  slackProvider: z.enum(["slack", "slack_bot"]).nullable(),
  slackChannels: z.array(
    z.object({
      slackChannelId: z.string(),
      slackChannelName: z.string(),
    })
  ),
  tags: z.array(tagSchema),
});

export const agentBuilderFormSchema = z.object({
  agentSettings: agentSettingsSchema,
  instructions: z.string().min(1, "Instructions are required"),
  generationSettings: generationSettingsSchema,
  actions: z.array(actionSchema),
});
export const agentBuilderMCPFormSchema = z.object({
  agentSettings: agentSettingsSchema,
  instructions: z.string().min(1, "Instructions are required"),
  generationSettings: generationSettingsSchema,
  actions: z.array(mcpActionSchema),
});

export type AgentBuilderFormData = z.infer<typeof agentBuilderFormSchema>;

// TODO: have only one AgentBuilderAction.
export type AgentBuilderAction = z.infer<typeof actionSchema>;
export type AgentBuilderMCPAction = z.infer<typeof mcpActionSchema>;
export type AgentBuilderDataVizAction = z.infer<
  typeof dataVisualizationActionSchema
>;

export type BaseActionData = z.infer<typeof baseActionSchema>;
