import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { CoreAPI } from "@app/types/core/core_api";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { TokenizeResponseType } from "@dust-tt/client";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

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
  auth: Authenticator,
  { dataSource }: { dataSource: DataSourceResource }
): Promise<void> {
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

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, {
    dataSource: { requireCanRead: true },
  })
);
