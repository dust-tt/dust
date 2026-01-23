import type { DiscordBotConfigurationType } from "./discord_bot";
import type { SlackConfigurationType } from "./slack";
import type { WebCrawlerConfigurationType } from "./webcrawler";

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
  google_drive: null;
  github: null;
  confluence: null;
  microsoft: null;
  intercom: null;
};
