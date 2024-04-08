import * as t from "io-ts";

import { WebCrawlerConfigurationTypeSchema } from "../webcrawler";

export const ConnectorConfigurationTypeSchema = t.union([
  WebCrawlerConfigurationTypeSchema,
  t.null,
]);

export const UpdateConnectorConfigurationTypeSchema = t.type({
  configuration: ConnectorConfigurationTypeSchema,
});

export type UpdateConnectorConfigurationType = t.TypeOf<
  typeof UpdateConnectorConfigurationTypeSchema
>;
