import { WebCrawlerConfigurationType } from "../connectors/webcrawler";

export type ConnectorConfiguration = WebCrawlerConfigurationType | null;

export type ConnectorConfigurations = {
  webcrawler: WebCrawlerConfigurationType;
  notion: null;
  // Slack technically has a configuration as per file `src/connectors/slack.ts` but we don't set it
  // here because we don't expect a configuration at connector creation time for now.
  slack: null;
  google_drive: null;
  github: null;
  confluence: null;
  microsoft: null;
  intercom: null;
};
