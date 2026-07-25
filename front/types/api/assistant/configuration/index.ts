// Shared contract types and schemas for the agent configurations API,
// imported by the agent configurations API routes.
import { LightAgentConfigurationSchema } from "@app/types/assistant/agent";
import { z } from "zod";

export const GetAgentConfigurationsResponseBodySchema = z.object({
  agentConfigurations: z.array(LightAgentConfigurationSchema),
});
export type GetAgentConfigurationsResponseBody = z.infer<
  typeof GetAgentConfigurationsResponseBodySchema
>;

export const PostAgentConfigurationResponseBodySchema = z.object({
  agentConfiguration: LightAgentConfigurationSchema,
});
export type PostAgentConfigurationResponseBody = z.infer<
  typeof PostAgentConfigurationResponseBodySchema
>;

// Bulk model update is not atomic: each agent is saved as a new version on its own, so the
// response tells which ones went through.
export const BatchUpdateAgentModelResponseBodySchema = z.object({
  success: z.literal(true),
  updatedAgentIds: z.array(z.string()),
  skippedAgentIds: z.array(z.string()),
});
export type BatchUpdateAgentModelResponseBody = z.infer<
  typeof BatchUpdateAgentModelResponseBodySchema
>;
