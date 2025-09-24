import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { handleSearch, SearchRequestBody } from "@app/lib/api/search";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type {
  ContentNodeWithParent,
  DataSourceType,
  DataSourceViewType,
  SearchWarningCode,
  WithAPIErrorResponse,
} from "@app/types";

export type DataSourceContentNode = ContentNodeWithParent & {
  dataSource: DataSourceType;
  dataSourceViews: DataSourceViewType[];
};

export type PostWorkspaceSearchResponseBody = {
  nodes: DataSourceContentNode[];
  warningCode: SearchWarningCode | null;
  nextPageCursor: string | null;
  resultsCount: number | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostWorkspaceSearchResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const bodyValidation = SearchRequestBody.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);

    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
      status_code: 400,
    });
  }

  logger.info(
    {
      workspaceId: auth.workspace()?.sId,
      params: bodyValidation.right,
    },
    "Search knowledge (global)"
  );
  const searchResult = await handleSearch(req, auth, bodyValidation.right);

  if (searchResult.isErr()) {
    return apiError(req, res, {
      status_code: searchResult.error.status,
      api_error: searchResult.error.error,
    });
  }

  return res.status(200).json(searchResult.value);
}

export default withSessionAuthenticationForWorkspace(handler);
