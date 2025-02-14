import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";
import * as z from "zod";
import { fromError } from "zod-validation-error";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { syncNotionUrls } from "@app/lib/api/poke/plugins/data_sources/notion_url_sync";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { apiError } from "@app/logger/withlogging";
type PostNotionSyncResponseBody = { success: true } | { error: string };

// zod type for payload
const PostNotionSyncPayload = z.object({
  urls: z.array(z.string()),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostNotionSyncResponseBody | void>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();

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

  // fetchById enforces through auth the authorization (workspace here mainly).
  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  // endpoint protected by feature flag
  if (
    !dataSource ||
    !(await getFeatureFlags(owner)).includes("advanced_notion_management")
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (!dataSource.connectorId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "data_source_not_managed",
        message: "The data source you requested is not managed.",
      },
    });
  }

  if (!dataSource.canAdministrate(auth) || !auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only the users that are `admins` for the current workspace can sync Notion URLs.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const bodyValidation = PostNotionSyncPayload.safeParse(req.body);

      if (bodyValidation.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(bodyValidation.error).toString(),
          },
        });
      }

      const { urls } = bodyValidation.data;

      const result = await syncNotionUrls({
        urlsArray: urls,
        dataSourceId: dsId,
        workspaceId: owner.sId,
      });

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: result.error.message,
          },
        });
      }

      res.status(200).json({ success: true });
      return;

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

export default withSessionAuthenticationForWorkspace(handler);
