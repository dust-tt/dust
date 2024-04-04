import * as t from "io-ts";

import { WebCrawlerConfigurationType } from "../webcrawler";

export const WebCrawlerConfigurationTypeSchema = t.type({
  url: t.string,
  depth: t.union([
    t.literal(0),
    t.literal(1),
    t.literal(2),
    t.literal(3),
    t.literal(4),
    t.literal(5),
  ]),
  maxPageToCrawl: t.number,
  crawlMode: t.union([t.literal("child"), t.literal("website")]),
  crawlFrequency: t.union([
    t.literal("never"),
    t.literal("daily"),
    t.literal("weekly"),
    t.literal("monthly"),
  ]),
});

export type ConnectorConfiguration = WebCrawlerConfigurationType | null;

export type ConnectorConfigurations = {
  webcrawler: WebCrawlerConfigurationType;
  notion: null;
  slack: null;
  google_drive: null;
  github: null;
  confluence: null;
  intercom: null;
};

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
