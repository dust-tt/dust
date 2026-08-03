import { AgentUsageSchema } from "@app/types/assistant/agent";
import { z } from "zod";

export const GetAgentUsageResponseBodySchema = z.object({
  agentUsage: AgentUsageSchema.nullable(),
});
export type GetAgentUsageResponseBody = z.infer<
  typeof GetAgentUsageResponseBodySchema
>;
