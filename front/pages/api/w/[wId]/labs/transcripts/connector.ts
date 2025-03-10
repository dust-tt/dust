import type { WithAPIErrorResponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getDataSources } from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import { acceptableTranscriptProvidersCodec } from "@app/pages/api/w/[wId]/labs/transcripts";

export const GetDefaultTranscriptsConfigurationBodySchema = t.type({
  provider: acceptableTranscriptProvidersCodec,
});

export type GetLabsTranscriptsIsConnectorConnectedResponseBody = {
  isConnected: boolean;
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
      const bodyValidation =
        GetDefaultTranscriptsConfigurationBodySchema.decode(req.query);

      if (isLeft(bodyValidation)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request.",
          },
        });
      }

      const { provider } = bodyValidation.right;

      const allDataSources = await getDataSources(auth);

      const dataSource = allDataSources.find(
        (ds) => ds.connectorProvider === provider
      );
      return res.status(200).json({
        isConnected: !!dataSource,
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
