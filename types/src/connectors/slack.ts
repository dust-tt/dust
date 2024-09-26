import * as t from "io-ts";

export type SlackConfigurationType = t.TypeOf<
  typeof SlackConfigurationTypeSchema
>;

export const SlackConfigurationTypeSchema = t.type({
  botEnabled: t.boolean,
  whitelistedDomains: t.union([t.array(t.string), t.undefined]),
  autoReadChannelPattern: t.union([t.string, t.null, t.undefined]),
});

export type SlackConfiguration = t.TypeOf<typeof SlackConfigurationTypeSchema>;

export type SlackbotWhitelistType = "summon_agent" | "index_messages";

export function isSlackbotWhitelistType(
  value: unknown
): value is SlackbotWhitelistType {
  return value === "summon_agent" || value === "index_messages";
}
