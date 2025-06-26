import React from "react";
import type { UseFormReturn } from "react-hook-form";
import { FormProvider } from "react-hook-form";
import { z } from "zod";

import { MODEL_IDS, MODEL_PROVIDER_IDS } from "@app/types/assistant/assistant";

const modelIdSchema = z.enum(MODEL_IDS);
const providerIdSchema = z.enum(MODEL_PROVIDER_IDS);

const supportedModelSchema = z.object({
  modelId: modelIdSchema,
  providerId: providerIdSchema,
  reasoningEffort: z.string().optional(),
});

const generationSettingsSchema = z.object({
  modelSettings: supportedModelSchema,
  temperature: z.number().min(0).max(1),
  responseFormat: z.string().optional(),
});

const actionSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  description: z.string(),
  configuration: z.record(z.unknown()),
  noConfigurationRequired: z.boolean().optional(),
});

const agentSettingsSchema = z.object({
  name: z.string().min(1, "Agent name is required"),
  description: z.string().min(1, "Agent description is required"),
});

export const agentBuilderFormSchema = z.object({
  agentSettings: agentSettingsSchema,
  instructions: z.string().min(1, "Instructions are required"),
  generationSettings: generationSettingsSchema,
  actions: z.array(actionSchema).default([]),
});

export type AgentBuilderFormData = z.infer<typeof agentBuilderFormSchema>;

export type AgentBuilderAction = z.infer<typeof actionSchema>;

interface AgentBuilderFormProviderProps {
  children: React.ReactNode;
  form: UseFormReturn<AgentBuilderFormData>;
}

export function AgentBuilderFormProvider({
  children,
  form,
}: AgentBuilderFormProviderProps) {
  function onSubmit() {
    return;
  }
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>{children}</form>
    </FormProvider>
  );
}
