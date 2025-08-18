import type { JSONSchema7 as JSONSchema } from "json-schema";
import { createContext, useContext } from "react";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";

import type { AdditionalConfigurationType } from "@app/lib/models/assistant/actions/mcp";
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

export const mcpServerViewIdSchema = z.string();

export const childAgentIdSchema = z.string().nullable();

export const additionalConfigurationSchema = z.record(
  z.string(),
  z.union([z.boolean(), z.number(), z.string(), z.array(z.string())])
);

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

export const jsonSchemaFieldSchema = z.custom<JSONSchema>().nullable();

export const jsonSchemaStringSchema = z.string().nullable();

const tagsFilterSchema = z
  .object({
    in: z.array(z.string()),
    not: z.array(z.string()),
    mode: z.enum(["custom", "auto"]),
  })
  .nullable();

const dataSourceViewSelectionConfigurationSchema = z
  .object({
    dataSourceView: z.custom<DataSourceViewType>(),
    selectedResources: z.array(z.custom<DataSourceViewContentNode>()),
    isSelectAll: z.boolean(),
    tagsFilter: tagsFilterSchema,
  })
  .nullable();

export const dataSourceConfigurationSchema = z
  .record(z.string(), dataSourceViewSelectionConfigurationSchema)
  .nullable();

export const timeFrameSchema = z
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
  noConfigurationRequired: z.boolean().optional(),
});

const TAG_KINDS = z.union([z.literal("standard"), z.literal("protected")]);

const tagSchema = z.object({
  sId: z.string(),
  name: z.string(),
  kind: TAG_KINDS,
});

const dataVisualizationActionSchema = baseActionSchema.extend({
  type: z.literal("DATA_VISUALIZATION"),
  configuration: z.null(),
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
  reasoningModel: reasoningModelSchema,
  timeFrame: mcpTimeFrameSchema,
  additionalConfiguration: additionalConfigurationSchema,
  dustAppConfiguration: dustAppConfigurationSchema,
  jsonSchema: jsonSchemaFieldSchema,
  _jsonSchemaString: jsonSchemaStringSchema,
});

export type MCPServerConfigurationType = z.infer<
  typeof mcpServerConfigurationSchema
>;

const mcpActionSchema = baseActionSchema.extend({
  type: z.literal("MCP"),
  configuration: mcpServerConfigurationSchema,
});

const actionSchema = z.discriminatedUnion("type", [
  dataVisualizationActionSchema,
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
  maxStepsPerRun: z
    .number()
    .min(1, "Max steps per run must be at least 1")
    .default(8),
});

export type AgentBuilderFormData = z.infer<typeof agentBuilderFormSchema>;

export type AgentBuilderAction = z.infer<typeof actionSchema>;
export type AgentBuilderDataVizAction = z.infer<
  typeof dataVisualizationActionSchema
>;

// TODO: create types from schema
export interface MCPFormData {
  name: string;
  description: string;
  configuration: {
    mcpServerViewId: string;
    dataSourceConfigurations: any;
    tablesConfigurations: any;
    childAgentId: string | null;
    reasoningModel: any;
    timeFrame: {
      duration: number;
      unit: "hour" | "day" | "week" | "month" | "year";
    } | null;
    additionalConfiguration: AdditionalConfigurationType;
    dustAppConfiguration: any;
    jsonSchema: any;
    _jsonSchemaString: string | null;
  };
}

export const AgentBuilderFormContext =
  createContext<UseFormReturn<AgentBuilderFormData> | null>(null);

export const useAgentBuilderFormActions = () => {
  const context = useContext(AgentBuilderFormContext);
  if (!context) {
    throw new Error("AgentBuilderFormContext not found");
  }

  const actions = context.getValues("actions");

  return {
    actions,
  };
};
