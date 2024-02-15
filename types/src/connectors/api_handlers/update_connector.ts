import * as t from "io-ts";

import { CreateConnectorUrlRequestBodySchema } from "../../connectors/api_handlers/create_connector";

export const UpdateConnectorOAuthRequestBodySchema = t.type({
  connectionId: t.union([t.string, t.null, t.undefined]),
});

export const UpdateConnectorRequestBodySchema = t.type({
  connectorParams: t.union([
    CreateConnectorUrlRequestBodySchema,
    UpdateConnectorOAuthRequestBodySchema,
  ]),
});

export type UpdateConnectorRequestBody = t.TypeOf<
  typeof UpdateConnectorRequestBodySchema
>;
