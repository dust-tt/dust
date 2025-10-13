import type { TokenizeResponseType } from "@dust-tt/client";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { CoreAPI } from "@app/types";

export type PostDatasourceTokenizeBody = {
  text: string;
};

const PostDatasourceTokenizeBodySchema = t.type({
  text: t.string,
});

/**
 * @ignoreswagger
 * This endpoint is not to be included in the public API docs.
 */
// At 5mn, likeliness of connection close increases significantly. The timeout is set at 4mn30.
const CORE_TOKENIZE_TIMEOUT_MS = 270000;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<TokenizeResponseType>>,
  auth: Authenticator
): Promise<void> {
  const { dsId } = req.query;
  if (typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    dsId,
    // TODO(DATASOURCE_SID): Clean-up
    { origin: "v1_data_sources_tokenize" }
  );

  // Handling the case where `spaceId` is undefined to keep support for the legacy endpoint (not under
  // space, global space assumed for the auth (the authenticator associated with the app, not the
  // user)).
  let { spaceId } = req.query;
  if (typeof spaceId !== "string") {
    if (auth.isSystemKey()) {
      // We also handle the legacy usage of connectors that taps into connected data sources which
      // are not in the global space. If this is a system key we trust it and set the `spaceId` to the
      // dataSource.space.sId.
      spaceId = dataSource?.space.sId;
    } else {
      spaceId = (await SpaceResource.fetchWorkspaceGlobalSpace(auth)).sId;
    }
  }

  if (
    !dataSource ||
    dataSource.space.sId !== spaceId ||
    !dataSource.canRead(auth)
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (dataSource.space.kind === "conversations") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you're trying to access was not found",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const bodyValidation = PostDatasourceTokenizeBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }
      const text = bodyValidation.right.text;
      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const coreTokenizeRes = await coreAPI.dataSourceTokenize(
        {
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
          text,
        },
        { timeoutMs: CORE_TOKENIZE_TIMEOUT_MS }
      );
      if (coreTokenizeRes.isErr()) {
        const isTimeout = coreTokenizeRes.error.code === "request_timeout";
        return apiError(req, res, {
          status_code: isTimeout ? 504 : 500,
          api_error: {
            type: "internal_server_error",
            message: `Error tokenizing text: ${coreTokenizeRes.error.message}`,
            data_source_error: coreTokenizeRes.error,
          },
        });
      }
      const tokens = coreTokenizeRes.value.tokens;
      res.status(200).json({ tokens });
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);
