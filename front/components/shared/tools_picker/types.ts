import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";

import { DEFAULT_MCP_ACTION_NAME } from "@app/lib/actions/constants";
import type { DataSourceViewContentNode, DataSourceViewType } from "@app/types";
import { MODEL_IDS } from "@app/types/assistant/models/models";
import { MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import { REASONING_EFFORTS } from "@app/types/assistant/models/reasoning";

const modelIdSchema = z.enum(MODEL_IDS);
const providerIdSchema = z.enum(MODEL_PROVIDER_IDS);
const reasoningEffortSchema = z.enum(REASONING_EFFORTS);

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

export const mcpServerViewIdSchema = z.string();

export const childAgentIdSchema = z.string().nullable();

export const additionalConfigurationSchema = z.record(
  z.string(),
  z.union([
    z.boolean(),
    z.number(),
    z.string(),
    z.array(z.string()),
    // Allow only one level of nesting
    z.record(
      z.string(),
      z.union([z.boolean(), z.number(), z.string(), z.array(z.string())])
    ),
  ])
);

export type AdditionalConfigurationInBuilderType = z.infer<
  typeof additionalConfigurationSchema
>;

export const dustAppConfigurationSchema = z
  .object({
    id: z.number(),
    sId: z.string(),
    type: z.literal("dust_app_run_configuration"),
    appWorkspaceId: z.string(),
    appId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
  })
  .nullable();

export const secretNameSchema = z.string().nullable();

export const jsonSchemaFieldSchema = z.custom<JSONSchema>().nullable();

export const jsonSchemaStringSchema = z.string().nullable();

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
  excludedResources: z.array(z.custom<DataSourceViewContentNode>()),
  isSelectAll: z.boolean(),
  tagsFilter: tagsFilterSchema,
});

export const dataSourceConfigurationSchema = z
  .record(z.string(), dataSourceViewSelectionConfigurationSchema)
  .nullable();

const timeFrameSchema = z
  .object({
    duration: z.number().min(1),
    unit: z.enum(["hour", "day", "week", "month", "year"]),
  })
  .nullable();

export const mcpTimeFrameSchema = timeFrameSchema;

const baseActionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  configurationRequired: z.boolean().optional(),
});

export const reasoningModelSchema = z
  .object({
    modelId: modelIdSchema,
    providerId: providerIdSchema,
    temperature: z.number().min(0).max(1).nullable(),
    reasoningEffort: reasoningEffortSchema.nullable(),
  })
  .nullable();

export const mcpServerConfigurationSchema = z.object({
  mcpServerViewId: mcpServerViewIdSchema,
  dataSourceConfigurations: dataSourceConfigurationSchema,
  tablesConfigurations: dataSourceConfigurationSchema,
  childAgentId: childAgentIdSchema,
  timeFrame: mcpTimeFrameSchema,
  additionalConfiguration: additionalConfigurationSchema,
  dustAppConfiguration: dustAppConfigurationSchema,
  secretName: secretNameSchema,
  jsonSchema: jsonSchemaFieldSchema,
  reasoningModel: reasoningModelSchema,
  _jsonSchemaString: jsonSchemaStringSchema,
});

export type MCPServerConfigurationType = z.infer<
  typeof mcpServerConfigurationSchema
>;

export const actionSchema = baseActionSchema.extend({
  type: z.literal("MCP"),
  configuration: mcpServerConfigurationSchema,
});

export type BuilderAction = z.infer<typeof actionSchema>;

export function isDefaultActionName(action: BuilderAction) {
  return action.name.includes(DEFAULT_MCP_ACTION_NAME);
}
