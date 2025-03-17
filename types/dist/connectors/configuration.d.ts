import { SlackConfigurationType } from "../connectors/slack";
import { WebCrawlerConfigurationType } from "../connectors/webcrawler";
export type ConnectorConfiguration = WebCrawlerConfigurationType | SlackConfigurationType | null;
export declare function isWebCrawlerConfiguration(config: ConnectorConfiguration | null): config is WebCrawlerConfigurationType;
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
//# sourceMappingURL=configuration.d.ts.map