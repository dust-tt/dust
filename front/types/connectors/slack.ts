import * as t from "io-ts";

// Auto-read patterns.

const SlackAutoReadPatternSchema = t.type({
  pattern: t.string,
  spaceId: t.string,
});
const SlackAutoReadPatternsSchema = t.array(SlackAutoReadPatternSchema);

export type SlackAutoReadPattern = t.TypeOf<typeof SlackAutoReadPatternSchema>;

export function isSlackAutoReadPatterns(
  v: unknown[]
): v is SlackAutoReadPattern[] {
  return SlackAutoReadPatternsSchema.is(v);
}

// Configuration.

export const SlackConfigurationTypeSchema = t.type({
  botEnabled: t.boolean,
  whitelistedDomains: t.union([t.array(t.string), t.undefined]),
  autoReadChannelPatterns: SlackAutoReadPatternsSchema,
  restrictedSpaceAgentsEnabled: t.union([t.boolean, t.undefined]),
});

export type SlackConfigurationType = t.TypeOf<
  typeof SlackConfigurationTypeSchema
>;

// Whitelist.

export type SlackbotWhitelistType = "summon_agent" | "index_messages";

function isSlackbotWhitelistType(
  value: unknown
): value is SlackbotWhitelistType {
  return value === "summon_agent" || value === "index_messages";
}
