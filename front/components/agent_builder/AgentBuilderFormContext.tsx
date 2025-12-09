import { createContext } from "react";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";

import type { AdditionalConfigurationInBuilderType } from "@app/components/shared/tools_picker/types";
import {
  actionSchema,
  generationSettingsSchema,
} from "@app/components/shared/tools_picker/types";
import { editorUserSchema } from "@app/types/editors";
import { WEBHOOK_PROVIDERS } from "@app/types/triggers/webhooks";

const TAG_KINDS = z.union([z.literal("standard"), z.literal("protected")]);

const tagSchema = z.object({
  sId: z.string(),
  name: z.string(),
  kind: TAG_KINDS,
});

const agentSettingsSchema = z.object({
  name: z
    .string()
    .min(1, "Agent name is required")
    .refine((value) => !/\s/.test(value), "Agent name cannot contain space"),
  description: z.string().min(1, "Agent description is required"),
  pictureUrl: z.string().optional(),
  scope: z.enum(["hidden", "visible"]),
  editors: z.array(editorUserSchema),
  slackProvider: z.enum(["slack", "slack_bot"]).nullable(),
  slackChannels: z.array(
    z.object({
      slackChannelId: z.string(),
      slackChannelName: z.string(),
      autoRespondWithoutMention: z.boolean().optional(),
    })
  ),
  tags: z.array(tagSchema),
});

const scheduleConfigSchema = z.object({
  cron: z.string(),
  timezone: z.string(),
});

const webhookConfigSchema = z.object({
  includePayload: z.boolean(),
  event: z.string().optional(),
  filter: z.string().optional(),
});

const webhookTriggerSchema = z.object({
  sId: z.string().optional(),
  enabled: z.boolean().default(true),
  name: z.string(),
  kind: z.enum(["webhook"]),
  provider: z.enum(WEBHOOK_PROVIDERS).optional(),
  customPrompt: z.string().nullable(),
  naturalLanguageDescription: z.string().nullable(),
  configuration: webhookConfigSchema,
  editor: z.number().nullable(),
  webhookSourceViewSId: z.string().nullable().optional(),
  editorName: z.string().optional(),
  executionPerDayLimitOverride: z.number().nullable(),
  executionMode: z.enum(["fair_use", "programmatic"]).nullable(),
});

const scheduleTriggerSchema = z.object({
  sId: z.string().optional(),
  enabled: z.boolean().default(true),
  name: z.string(),
  kind: z.enum(["schedule"]),
  customPrompt: z.string().nullable(),
  naturalLanguageDescription: z.string().nullable(),
  configuration: scheduleConfigSchema,
  editor: z.number().nullable(),
  editorName: z.string().optional(),
});

const triggerSchema = z.discriminatedUnion("kind", [
  webhookTriggerSchema,
  scheduleTriggerSchema,
]);

export type AgentBuilderWebhookTriggerType = z.infer<
  typeof webhookTriggerSchema
>;
export type AgentBuilderScheduleTriggerType = z.infer<
  typeof scheduleTriggerSchema
>;

export const agentBuilderFormSchema = z.object({
  agentSettings: agentSettingsSchema,
  instructions: z.string().min(1, "Instructions are required"),
  generationSettings: generationSettingsSchema,
  actions: z.array(actionSchema),
  triggersToCreate: z.array(triggerSchema),
  triggersToUpdate: z.array(triggerSchema),
  triggersToDelete: z.array(z.string()),
  maxStepsPerRun: z
    .number()
    .min(1, "Max steps per run must be at least 1")
    .default(8),
});

export type AgentBuilderFormData = z.infer<typeof agentBuilderFormSchema>;

export type AgentBuilderTriggerType = z.infer<typeof triggerSchema>;

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
    additionalConfiguration: AdditionalConfigurationInBuilderType;
    dustAppConfiguration: any;
    secretName: string | null;
    jsonSchema: any;
    _jsonSchemaString: string | null;
  };
}

export const AgentBuilderFormContext =
  createContext<UseFormReturn<AgentBuilderFormData> | null>(null);
