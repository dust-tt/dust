import * as t from "io-ts";

import { CreateConnectorOAuthRequestBodySchema, CreateConnectorUrlRequestBodySchema } from "../../connectors/api_handlers/create_connector";



export const UpdateConnectorRequestBodySchema = t.type({
    connectorParams: t.union([
      CreateConnectorUrlRequestBodySchema,
      CreateConnectorOAuthRequestBodySchema,
    ])
  });
  
  export type UpdateConnectorRequestBody = t.TypeOf<
    typeof UpdateConnectorRequestBodySchema
  >;