import * as t from "io-ts";

export const DiscordBotConfigurationTypeSchema = t.type({
  botEnabled: t.boolean,
});

export type DiscordBotConfigurationType = t.TypeOf<
  typeof DiscordBotConfigurationTypeSchema
>;
