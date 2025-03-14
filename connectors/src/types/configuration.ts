import * as t from "io-ts";

import type { SlackConfigurationType } from "./slack";
import { SlackConfigurationTypeSchema } from "./slack";
import type { WebCrawlerConfigurationType } from "./webcrawler";
import { WebCrawlerConfigurationTypeSchema } from "./webcrawler";

export const ConnectorConfigurationTypeSchema = t.union([
  WebCrawlerConfigurationTypeSchema,
  SlackConfigurationTypeSchema,
  t.null,
]);

const UpdateConnectorConfigurationTypeSchema = t.type({
  configuration: ConnectorConfigurationTypeSchema,
});

export type UpdateConnectorConfigurationType = t.TypeOf<
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
  google_drive: null;
  github: null;
  confluence: null;
  microsoft: null;
  intercom: null;
};
