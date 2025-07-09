import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getDataSources } from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";
import {
  acceptableTranscriptProvidersCodec,
  acceptableTranscriptsWithConnectorProvidersCodec,
} from "@app/pages/api/w/[wId]/labs/transcripts";
import type { WithAPIErrorResponse } from "@app/types";

export const GetDefaultTranscriptsConfigurationBodySchema = t.type({
  provider: t.union([
    acceptableTranscriptProvidersCodec,
    acceptableTranscriptsWithConnectorProvidersCodec,
  ]),
});

export type GetLabsTranscriptsIsConnectorConnectedResponseBody = {
  isConnected: boolean;
  dataSource: DataSourceResource | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetLabsTranscriptsIsConnectorConnectedResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const flags = await getFeatureFlags(owner);

  if (!flags.includes("labs_transcripts")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "feature_flag_not_found",
        message: "The feature is not enabled for this workspace.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const queryValidation =
        GetDefaultTranscriptsConfigurationBodySchema.decode(req.query);

      if (isLeft(queryValidation)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request.",
          },
        });
      }

      const { provider } = queryValidation.right;

      const allDataSources = await getDataSources(auth);

      const dataSource = allDataSources.find(
        (ds) => ds.connectorProvider === provider
      );
      return res.status(200).json({
        isConnected: !!dataSource,
        dataSource: dataSource ?? null,
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
