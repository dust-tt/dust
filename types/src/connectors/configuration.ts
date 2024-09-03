import { SlackConfigurationType } from "../connectors//slack";
import { WebCrawlerConfigurationType } from "../connectors/webcrawler";

export type ConnectorConfiguration =
  | WebCrawlerConfigurationType
  | SlackConfigurationType
  | null;

export function isWebCrawlerConfiguration(
  config: ConnectorConfiguration | null
): config is WebCrawlerConfigurationType {
  return (config as WebCrawlerConfigurationType)?.crawlMode !== undefined;
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
