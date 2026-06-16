import { getDataSources } from "@app/lib/api/data_sources";
import type { DataSourceType } from "@app/types/data_source";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import {
  acceptableTranscriptProvidersCodec,
  acceptableTranscriptsWithConnectorProvidersCodec,
} from "./schemas";

const GetConnectorQuerySchema = z.object({
  provider: z.union([
    acceptableTranscriptProvidersCodec,
    acceptableTranscriptsWithConnectorProvidersCodec,
  ]),
});

export type GetLabsTranscriptsIsConnectorConnectedResponseBody = {
  isConnected: boolean;
  dataSource: DataSourceType | null;
};

// Mounted at /api/w/:wId/labs/transcripts/connector.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", GetConnectorQuerySchema),
  async (
    ctx
  ): HandlerResult<GetLabsTranscriptsIsConnectorConnectedResponseBody> => {
    const auth = ctx.get("auth");
    const { provider } = ctx.req.valid("query");

    const allDataSources = await getDataSources(auth);
    const dataSource = allDataSources.find(
      (ds) => ds.connectorProvider === provider
    );

    return ctx.json({
      isConnected: !!dataSource,
      dataSource: dataSource?.toJSON() ?? null,
    });
  }
);

export default app;
