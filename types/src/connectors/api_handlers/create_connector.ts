import * as t from "io-ts";

export const CreateConnectorUrlRequestBodySchema = t.type({
  url: t.string,
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
