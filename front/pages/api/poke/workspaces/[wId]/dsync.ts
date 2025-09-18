import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { getWorkOSOrganizationDSyncDirectories } from "@app/lib/api/workos/organization";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import type { WorkOSConnectionSyncStatus } from "@app/lib/types/workos";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { normalizeError } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<Omit<WorkOSConnectionSyncStatus, "setupLink">>
  >,
  session: SessionWithUser
) {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );
  const owner = auth.getNonNullableWorkspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  const r = await getWorkOSOrganizationDSyncDirectories({
    workspace: owner,
  });
  if (r.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "workos_server_error",
        message: `Failed to list directories: ${normalizeError(r.error).message}`,
      },
    });
  }
  const directories = r.value;

  if (directories.length > 1) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workos_multiple_directories_not_supported",
        message: "Multiple directories are not supported.",
      },
    });
  }

  const [activeDirectory] = directories;

  switch (req.method) {
    case "GET":
      let status: WorkOSConnectionSyncStatus["status"] = "not_configured";

      if (activeDirectory) {
        status =
          activeDirectory.state === "active" ? "configured" : "configuring";
      }

      res.status(200).json({
        status,
        connection: activeDirectory
          ? {
              id: activeDirectory.id,
              state: activeDirectory.state,
              type: activeDirectory.type,
            }
          : null,
      });

      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
