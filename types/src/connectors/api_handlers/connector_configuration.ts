import * as t from "io-ts";

import { SlackConfigurationTypeSchema } from "../../connectors/slack";
import { WebCrawlerConfigurationTypeSchema } from "../../connectors/webcrawler";

export const ConnectorConfigurationTypeSchema = t.union([
  WebCrawlerConfigurationTypeSchema,
  SlackConfigurationTypeSchema,
  t.null,
]);

export const UpdateConnectorConfigurationTypeSchema = t.type({
  configuration: ConnectorConfigurationTypeSchema,
});

export type UpdateConnectorConfigurationType = t.TypeOf<
  typeof UpdateConnectorConfigurationTypeSchema
>;
