import * as t from "io-ts";

export const SlackLabsConfigurationTypeSchema = t.type({
  channelId: t.string,
  agentConfigurationId: t.string,
  isEnabled: t.boolean,
});

export type SlackLabsConfigurationType = t.TypeOf<
  typeof SlackLabsConfigurationTypeSchema
>;
