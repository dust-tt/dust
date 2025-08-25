import type { SlackConfigurationType } from "./slack";
import type { WebCrawlerConfigurationType } from "./webcrawler";
import type { SlackLabsConfigurationType } from "./slack_labs";

export type ConnectorConfiguration =
  | WebCrawlerConfigurationType
  | SlackConfigurationType
  | SlackLabsConfigurationType
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
  slack_labs: SlackLabsConfigurationType;
  google_drive: null;
  github: null;
  confluence: null;
  microsoft: null;
  intercom: null;
};
