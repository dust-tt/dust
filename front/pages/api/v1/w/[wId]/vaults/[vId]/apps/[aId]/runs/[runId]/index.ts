/* eslint jsdoc/no-missing-syntax: 0 */ //
// Disabling jsdoc rule, as we're not yet documentating dust apps endpoints under vaults.
// We still document the legacy endpoint, which does the same thing.
// Note: for now, an API key only has access to the global vault.
import type { RunType, WithAPIErrorResponse } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import apiConfig from "@app/lib/api/config";
import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export const config = {
  api: {
    responseLimit: "8mb",
  },
};

export type GetRunResponseBody = {
  run: RunType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetRunResponseBody>>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }
  const { keyAuth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const owner = keyAuth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to access was not found",
      },
    });
  }

  const globalVault = await VaultResource.fetchWorkspaceGlobalVault(keyAuth);
  if (!globalVault) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "vault_not_found",
        message: "The vault you're trying to access was not found",
      },
    });
  }

  if (req.query.vId !== undefined && req.query.vId !== globalVault.sId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "vault_not_found",
        message: "The vault you're trying to access was not found",
      },
    });
  }

  const app = await AppResource.fetchById(keyAuth, req.query.aId as string);

  if (!app || app.vault.sId !== globalVault.sId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app you're trying to run was not found",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const runId = req.query.runId as string;

      logger.info(
        {
          workspace: {
            sId: owner.sId,
            name: owner.name,
          },
          app: app.sId,
          runId,
        },
        "App run retrieve"
      );

      // TODO(spolu): This is borderline security-wise as it allows to recover a full run from the
      // runId assuming the app is public. We should use getRun and also enforce in getRun that we
      // retrieve only our own runs. Basically this assumes the `runId` as a secret.
      const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
      const runRes = await coreAPI.getRun({
        projectId: app.dustAPIProjectId,
        runId,
      });
      if (runRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "run_error",
            message: "There was an error retrieving the run.",
            run_error: runRes.error,
          },
        });
      }
      const run: RunType = runRes.value.run;
      run.specification_hash = run.app_hash;
      delete run.app_hash;

      if (run.status.run === "succeeded" && run.traces.length > 0) {
        run.results = run.traces[run.traces.length - 1][1];
      } else {
        run.results = null;
      }

      res.status(200).json({ run });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);
