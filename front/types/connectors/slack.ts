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
  return SlackAutoReadPatternsSchema.safeParse(v).success;
}

// Configuration.

export const SlackConfigurationTypeSchema = z.object({
  botEnabled: z.boolean(),
  whitelistedDomains: z.array(z.string()).optional(),
  autoReadChannelPatterns: SlackAutoReadPatternsSchema,
  restrictedSpaceAgentsEnabled: z.boolean().optional(),
  privateIntegrationCredentialId: z.string().optional(),
});

export type SlackConfigurationType = z.infer<
  typeof SlackConfigurationTypeSchema
>;

// Whitelist.
