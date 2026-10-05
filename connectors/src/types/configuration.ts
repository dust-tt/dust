import { z } from "zod";

import type { SlackConfigurationType } from "./slack";
import type { WebCrawlerConfigurationType } from "./webcrawler";
import { SlackConfigurationTypeSchema } from "./slack";
import { WebCrawlerConfigurationTypeSchema } from "./webcrawler";

export const ConnectorConfigurationTypeSchema = z.union([
  WebCrawlerConfigurationTypeSchema,
  SlackConfigurationTypeSchema,
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
  dust_project: null;
  google_drive: null;
  github: null;
  confluence: null;
  microsoft: null;
  intercom: null;
};
