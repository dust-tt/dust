import { WorkflowNotFoundError } from "@temporalio/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { makeUserDigestWorkflowId } from "@app/temporal/project_user_digest_queue/client";
import type { WithAPIErrorResponse } from "@app/types/error";

type DigestGenerationStatus = "running" | "completed" | "failed" | "not_found";

export type GetDigestGenerationStatusResponseBody = {
  status: DigestGenerationStatus;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetDigestGenerationStatusResponseBody>
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (!space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "User project digests are only available for project spaces.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const workspace = auth.getNonNullableWorkspace();
      const workflowId = makeUserDigestWorkflowId({
        workspaceId: workspace.sId,
        spaceId: space.sId,
        userId: auth.getNonNullableUser().sId,
      });

      const client = await getTemporalClientForFrontNamespace();

      try {
        const handle = client.workflow.getHandle(workflowId);
        const workflowExecution = await handle.describe();

        let status: DigestGenerationStatus;
        switch (workflowExecution.status.name) {
          case "RUNNING":
            status = "running";
            break;
          case "COMPLETED":
            status = "completed";
            break;
          default:
            status = "failed";
            break;
        }

        return res.status(200).json({ status });
      } catch (e) {
        if (e instanceof WorkflowNotFoundError) {
          return res.status(200).json({ status: "not_found" });
        }

        logger.error(
          {
            workflowId,
            error: e,
          },
          "Failed to describe user digest generation workflow"
        );

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to check digest generation status.",
          },
        });
      }
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
