import * as t from "io-ts";

import { ConnectorConfigurationTypeSchema } from "./connector_configuration";

export const ConnectorCreateRequestBodySchema = t.type({
  workspaceAPIKey: t.string,
  dataSourceName: t.string,
  dataSourceId: t.string,
  workspaceId: t.string,
  connectionId: t.string,
  configuration: ConnectorConfigurationTypeSchema,
});

export type ConnectorCreateRequestBody = t.TypeOf<
  typeof ConnectorCreateRequestBodySchema
>;
