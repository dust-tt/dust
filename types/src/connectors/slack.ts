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
