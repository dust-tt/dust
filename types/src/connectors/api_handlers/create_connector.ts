import * as t from "io-ts";

export const CreateConnectorUrlRequestBodySchema = t.type({
  url: t.string,
  depth: t.number,
  maxPages: t.number,
  crawlMode: t.union([t.literal("child"), t.literal("website")]),
  crawlFrequency: t.union([
    t.literal("never"),
    t.literal("daily"),
    t.literal("weekly"),
    t.literal("monthly"),
  ]),
});

export const CreateConnectorOAuthRequestBodySchema = t.type({
  connectionId: t.string,
});

export const ConnectorCreateRequestBodySchema = t.type({
  workspaceAPIKey: t.string,
  dataSourceName: t.string,
  workspaceId: t.string,
  connectorParams: t.union([
    CreateConnectorUrlRequestBodySchema,
    CreateConnectorOAuthRequestBodySchema,
  ]),
});

export type CreateConnectorUrlRequestBody = t.TypeOf<
  typeof CreateConnectorUrlRequestBodySchema
>;

export type CreateConnectorOAuthRequestBody = t.TypeOf<
  typeof CreateConnectorOAuthRequestBodySchema
>;
