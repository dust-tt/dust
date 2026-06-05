// Shared contract types and schemas for the agent configurations API,
// imported by both the Next handler and its Hono counterpart.
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
