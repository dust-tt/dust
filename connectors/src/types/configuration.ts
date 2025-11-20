import { z } from "zod";

import type { DiscordBotConfigurationType } from "./discord_bot";
import { DiscordBotConfigurationTypeSchema } from "./discord_bot";
import type { SlackConfigurationType } from "./slack";
import { SlackConfigurationTypeSchema } from "./slack";
import type { WebCrawlerConfigurationType } from "./webcrawler";
import { WebCrawlerConfigurationTypeSchema } from "./webcrawler";

export const ConnectorConfigurationTypeSchema = z.union([
  WebCrawlerConfigurationTypeSchema,
  SlackConfigurationTypeSchema,
  DiscordBotConfigurationTypeSchema,
  z.null(),
]);

const UpdateConnectorConfigurationTypeSchema = z.object({
  configuration: ConnectorConfigurationTypeSchema,
});

export type UpdateConnectorConfigurationType = z.infer<
  typeof UpdateConnectorConfigurationTypeSchema
>;

export type ConnectorConfiguration =
  | WebCrawlerConfigurationType
  | SlackConfigurationType
  | DiscordBotConfigurationType
  | null;

export function isWebCrawlerConfiguration(
  config: ConnectorConfiguration | null
): config is WebCrawlerConfigurationType {
  const maybeWebCrawlerConfig = config as WebCrawlerConfigurationType;

  return (
    maybeWebCrawlerConfig?.url !== undefined &&
    maybeWebCrawlerConfig?.depth !== undefined &&
    maybeWebCrawlerConfig?.maxPageToCrawl !== undefined &&
    maybeWebCrawlerConfig?.crawlMode !== undefined &&
    maybeWebCrawlerConfig?.crawlFrequency !== undefined &&
    maybeWebCrawlerConfig?.headers !== undefined
  );
}

export type ConnectorConfigurations = {
  webcrawler: WebCrawlerConfigurationType;
  notion: null;
  slack: SlackConfigurationType;
  slack_bot: SlackConfigurationType;
  discord_bot: DiscordBotConfigurationType;
  google_drive: null;
  github: null;
  confluence: null;
  microsoft: null;
  intercom: null;
};
