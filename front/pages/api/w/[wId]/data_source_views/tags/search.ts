/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { CoreAPISearchTagsResponse } from "@app/types/core/core_api";
import { CoreAPI } from "@app/types/core/core_api";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export const PostTagSearchBodySchema = z.object({
  query: z.string(),
  queryType: z.enum(["exact", "prefix", "match"]),
  dataSourceViewIds: z.array(z.string()),
});

export type PostTagSearchBody = z.infer<typeof PostTagSearchBodySchema>;

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

  const bodyValidation = PostTagSearchBodySchema.safeParse(req.body);
  if (!bodyValidation.success) {
    const pathError = fromError(bodyValidation.error).toString();

    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const { dataSourceViewIds, query, queryType } = bodyValidation.data;

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
