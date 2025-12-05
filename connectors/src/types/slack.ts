import { z } from "zod";

// Auto-read patterns.

const SlackAutoReadPatternSchema = z.object({
  pattern: z.string(),
  spaceId: z.string(),
});
const SlackAutoReadPatternsSchema = z.array(SlackAutoReadPatternSchema);

export type SlackAutoReadPattern = z.infer<typeof SlackAutoReadPatternSchema>;

export function isSlackAutoReadPatterns(
  v: unknown[]
): v is SlackAutoReadPattern[] {
  const result = SlackAutoReadPatternsSchema.safeParse(v);
  return result.success;
}

// Configuration.

export const SlackConfigurationTypeSchema = z.object({
  botEnabled: z.boolean(),
  whitelistedDomains: z.array(z.string()).optional(),
  autoReadChannelPatterns: SlackAutoReadPatternsSchema,
  restrictedSpaceAgentsEnabled: z.boolean().optional(),
  feedbackVisibleToAuthorOnly: z.boolean().optional(),
  privateIntegrationCredentialId: z.string().optional(),
});

export type SlackConfigurationType = z.infer<
  typeof SlackConfigurationTypeSchema
>;

// Whitelist.

export type SlackbotWhitelistType = "summon_agent" | "index_messages";

export function isSlackbotWhitelistType(
  value: unknown
): value is SlackbotWhitelistType {
  return value === "summon_agent" || value === "index_messages";
}
