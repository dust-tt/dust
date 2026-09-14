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

const PostAgentConfigurationResponseBodySchema = z.object({
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

// Inactive-agent archival. The skip reasons are the rules' exclusions plus the two outcomes only a
// caller reading or mutating can produce; kept loose here so an older client tolerates a new one.
const AgentArchivalSkipCountsSchema = z.record(z.string(), z.number().int());

export const PreviewInactiveAgentsResponseBodySchema = z.object({
  preview: z.object({
    evaluatedAt: z.string(),
    cutoffAt: z.string(),
    thresholdDays: z.number().int(),
    eligibleCount: z.number().int(),
    skippedCountByReason: AgentArchivalSkipCountsSchema,
  }),
});
export type PreviewInactiveAgentsResponseBody = z.infer<
  typeof PreviewInactiveAgentsResponseBodySchema
>;

export const ArchiveInactiveAgentsResponseBodySchema = z.object({
  archival: z.object({
    evaluatedAt: z.string(),
    cutoffAt: z.string(),
    thresholdDays: z.number().int(),
    archivedCount: z.number().int(),
    skippedCountByReason: AgentArchivalSkipCountsSchema,
  }),
});
export type ArchiveInactiveAgentsResponseBody = z.infer<
  typeof ArchiveInactiveAgentsResponseBodySchema
>;
