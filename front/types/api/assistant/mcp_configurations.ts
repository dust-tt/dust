import { z } from "zod";

export const AgentMcpConfigurationSummarySchema = z.object({
  sId: z.string(),
  name: z.string().nullable(),
});

export type AgentMcpConfigurationSummary = z.infer<
  typeof AgentMcpConfigurationSummarySchema
>;

export const GetAgentMcpConfigurationsResponseBodySchema = z.object({
  configurations: z.array(AgentMcpConfigurationSummarySchema),
});

export type GetAgentMcpConfigurationsResponseBody = z.infer<
  typeof GetAgentMcpConfigurationsResponseBodySchema
>;
