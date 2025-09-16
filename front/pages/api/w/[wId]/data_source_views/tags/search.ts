import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type {
  CoreAPISearchTagsResponse,
  WithAPIErrorResponse,
} from "@app/types";
import { CoreAPI } from "@app/types";

export const PostTagSearchBodySchema = t.type({
  query: t.string,
  queryType: t.union([
    t.literal("exact"),
    t.literal("prefix"),
    t.literal("match"),
  ]),
  dataSourceViewIds: t.array(t.string),
});

export type PostTagSearchBody = t.TypeOf<typeof PostTagSearchBodySchema>;

export type PostTagSearchResponseBody = CoreAPISearchTagsResponse;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostTagSearchResponseBody>>,
  auth: Authenticator
) {
  const user = auth.getNonNullableUser();
  if (!user || !auth.isUser()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "data_source_auth_error",
        message: "You are not authorized to fetch tags.",
      },
    });
  }

  const { method } = req;

  if (method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const bodyValidation = PostTagSearchBodySchema.decode(req.body);
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

  const { dataSourceViewIds, query, queryType } = bodyValidation.right;

  const dataSourceViews = await DataSourceViewResource.fetchByIds(
    auth,
    dataSourceViewIds
  );
  if (dataSourceViews.some((dsv) => !dsv.canRead(auth))) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message: "You are not authorized to fetch tags.",
      },
    });
  }

  const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
  const result = await coreAPI.searchTags({
    query,
    queryType,
    dataSourceViews: dataSourceViews.map((dsv) => dsv.toJSON()),
  });

  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to search tags",
      },
    });
  }

  return res.status(200).json(result.value);
}

export default withSessionAuthenticationForWorkspace(handler);
