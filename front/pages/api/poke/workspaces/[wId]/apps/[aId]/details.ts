import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { cleanSpecificationFromCore, getSpecification } from "@app/lib/api/run";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { AppResource } from "@app/lib/resources/app_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { AppType, SpecificationType } from "@app/types/app";
import { CoreAPI } from "@app/types/core/core_api";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type PokeGetAppDetails = {
  app: AppType;
  specification: SpecificationType;
  specificationHashes: string[] | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetAppDetails>>,
  session: SessionWithUser
): Promise<void> {
  const { wId, aId, hash } = req.query;
  if (!isString(wId) || !isString(aId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or app ID.",
      },
    });
  }

  if (!isString(hash)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid hash parameter.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const app = await AppResource.fetchById(auth, aId);

      if (!app) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_not_found",
            message: "App not found.",
          },
        });
      }

      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
      const specificationHashes = await coreAPI.getSpecificationHashes({
        projectId: app.dustAPIProjectId,
      });

      let specification = JSON.parse(app.savedSpecification ?? "{}");
      if (hash && hash.length > 0) {
        const specificationFromCore = await getSpecification(
          app.toJSON(),
          hash
        );
        if (specificationFromCore) {
          cleanSpecificationFromCore(specificationFromCore);
          specification = specificationFromCore;
        }
      }

      return res.status(200).json({
        app: app.toJSON(),
        specification,
        specificationHashes: specificationHashes.isOk()
          ? specificationHashes.value.hashes.reverse()
          : null,
      });

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

export default withSessionAuthenticationForPoke(handler);
