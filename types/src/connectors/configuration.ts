import { WebCrawlerConfigurationType } from "../connectors/webcrawler";

export type ConnectorConfiguration = WebCrawlerConfigurationType | null;

export type ConnectorConfigurations = {
  webcrawler: WebCrawlerConfigurationType;
  notion: null;
  slack: null;
  google_drive: null;
  github: null;
  confluence: null;
  microsoft: null;
  intercom: null;
};
