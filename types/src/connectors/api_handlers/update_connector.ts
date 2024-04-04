import * as t from "io-ts";

export const UpdateConnectorRequestBodySchema = t.type({
  connectionId: t.string,
});

export type UpdateConnectorRequestBody = t.TypeOf<
  typeof UpdateConnectorRequestBodySchema
>;
