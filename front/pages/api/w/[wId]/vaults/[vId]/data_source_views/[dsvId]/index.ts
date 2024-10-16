import type { DataSourceViewType, WithAPIErrorResponse } from "@dust-tt/types";
import { PatchDataSourceViewSchema } from "@dust-tt/types";
import { isLeft } from "fp-ts/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { handlePatchDataSourceView } from "@app/lib/api/data_source_view";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { apiError } from "@app/logger/withlogging";

export type PatchDataSourceViewResponseBody = {
  dataSourceView: DataSourceViewType;
};

export type GetDataSourceViewResponseBody = {
  dataSourceView: DataSourceViewType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetDataSourceViewResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const dataSourceView = await DataSourceViewResource.fetchById(
    auth,
    req.query.dsvId as string
  );

  if (
    !dataSourceView ||
    req.query.vId !== dataSourceView.vault.sId ||
    !dataSourceView.canList(auth)
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }
  switch (req.method) {
    case "GET": {
      return res.status(200).json({
        dataSourceView: dataSourceView.toJSON(),
      });
    }

    case "PATCH": {
      const patchBodyValidation = PatchDataSourceViewSchema.decode(req.body);

      if (isLeft(patchBodyValidation)) {
        const pathError = reporter.formatValidationErrors(
          patchBodyValidation.left
        );
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            message: `invalid request body: ${pathError}`,
            type: "invalid_request_error",
          },
        });
      }

      const { right: patchBody } = patchBodyValidation;

      const r = await handlePatchDataSourceView(
        patchBody,
        auth,
        dataSourceView
      );
      if (r.isErr()) {
        return apiError(req, res, r.error);
      }
      return res.status(200).json({
        dataSourceView: r.value.toJSON(),
      });
    }

    case "DELETE": {
      if (!auth.isAdmin() || !auth.isBuilder()) {
        // Only admins, or builders who have to the vault, can patch
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Only users that are `admins` or `builder` can administrate vaults.",
          },
        });
      }

      const usageRes = await dataSourceView.getUsagesByAgents(auth);
      if (usageRes.isErr() || usageRes.value.count > 0) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "data_source_error",
            message: usageRes.isOk()
              ? `The data source view is in use by ${usageRes.value.agentNames.join(", ")} and cannot be deleted.`
              : "The data source view is in use and cannot be deleted.",
          },
        });
      }

      // Directly, hard delete the data source view.
      await dataSourceView.delete(auth, { hardDelete: true });

      res.status(204).end();
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
