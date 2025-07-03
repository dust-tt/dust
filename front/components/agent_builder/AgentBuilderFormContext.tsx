import React from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { FormProvider } from "react-hook-form";
import { z } from "zod";

import { EXTENDED_MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types";
import {
  MODEL_IDS,
  MODEL_PROVIDER_IDS,
  REASONING_EFFORT_IDS,
} from "@app/types/assistant/assistant";

const modelIdSchema = z.enum(MODEL_IDS);
const providerIdSchema = z.enum(MODEL_PROVIDER_IDS);
const reasoningEffortSchema = z.enum(REASONING_EFFORT_IDS).optional();

const supportedModelSchema = z.object({
  modelId: modelIdSchema,
  providerId: providerIdSchema,
  reasoningEffort: reasoningEffortSchema,
});

export const generationSettingsSchema = z.object({
  modelSettings: supportedModelSchema,
  temperature: z.number().min(0).max(1),
  responseFormat: z.string().optional(),
});

export type AgentBuilderGenerationSettings = z.infer<
  typeof generationSettingsSchema
>;

const actionSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  description: z.string(),
  configuration: z.record(z.unknown()),
  noConfigurationRequired: z.boolean().optional(),
});

const TAG_KINDS = z.union([z.literal("standard"), z.literal("protected")]);

const tagSchema = z.object({
  sId: z.string(),
  name: z.string(),
  kind: TAG_KINDS,
});

const agentSettingsSchema = z.object({
  name: z.string().min(1, "Agent name is required"),
  description: z.string().min(1, "Agent description is required"),
  pictureUrl: z.string().optional(),
  tags: z.array(tagSchema),
});

export const agentBuilderFormSchema = z.object({
  agentSettings: agentSettingsSchema,
  instructions: z.string().min(1, "Instructions are required"),
  generationSettings: generationSettingsSchema,
  actions: z.array(actionSchema),
  maxStepsPerRun: z.number().min(1).max(EXTENDED_MAX_STEPS_USE_PER_RUN_LIMIT),
});

export type AgentBuilderFormData = z.infer<typeof agentBuilderFormSchema>;

export type AgentBuilderAction = z.infer<typeof actionSchema>;
