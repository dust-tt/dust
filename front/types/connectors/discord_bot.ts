import { z } from "zod";

export const DiscordBotConfigurationTypeSchema = z.object({
  botEnabled: z.boolean(),
});

export type DiscordBotConfigurationType = z.infer<
  typeof DiscordBotConfigurationTypeSchema
>;
