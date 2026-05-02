/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import { type Authenticator, getFeatureFlags } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import {
  launchOrSignalProjectTodoWorkflow,
  startImmediateProjectTodoWorkflowOnce,
  stopProjectTodoWorkflow,
} from "@app/temporal/project_todo/client";
import { PatchProjectMetadataBodySchema } from "@app/types/api/internal/spaces";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ProjectMetadataType } from "@app/types/project_metadata";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetProjectMetadataResponseBody = {
  projectMetadata: ProjectMetadataType | null;
};

export type PatchProjectMetadataResponseBody = {
  projectMetadata: ProjectMetadataType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetProjectMetadataResponseBody | PatchProjectMetadataResponseBody
    >
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  // Only project spaces can have metadata
  if (!space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Project metadata is only available for project spaces.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
      return res.status(200).json({
        projectMetadata: metadata ? metadata.toJSON() : null,
      });
    }

    case "PATCH": {
      if (!space.canAdministrate(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only project editors can update project metadata.",
          },
        });
      }

      const bodyValidation = PatchProjectMetadataBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        const errorMessage = bodyValidation.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${errorMessage}`,
          },
        });
      }

      const body = bodyValidation.data;

      let metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
      const featureFlags = await getFeatureFlags(auth);
      const projectTodoEnabled = featureFlags.includes("project_todo");

      const priorLastTodoAnalysisAt = metadata?.lastTodoAnalysisAt ?? null;
      const priorTodoGenerationEnabled =
        metadata?.todoGenerationEnabled ?? false;

      const shouldTriggerFirstImmediateSync =
        projectTodoEnabled &&
        body.todoGenerationEnabled === true &&
        !priorTodoGenerationEnabled &&
        priorLastTodoAnalysisAt === null;

      if (!metadata) {
        metadata = await ProjectMetadataResource.makeNew(auth, space, {
          description: body.description ?? null,
          archivedAt: body.archive ? new Date() : null,
          todoGenerationEnabled: body.todoGenerationEnabled ?? false,
          initialTodoAnalysisLookback: body.initialTodoAnalysisLookback ?? null,
        });
        if (!body.archive && projectTodoEnabled) {
          void launchOrSignalProjectTodoWorkflow({
            workspaceId: auth.getNonNullableWorkspace().sId,
            spaceId: space.sId,
          });
        }
        if (shouldTriggerFirstImmediateSync && !body.archive) {
          void startImmediateProjectTodoWorkflowOnce({
            workspaceId: auth.getNonNullableWorkspace().sId,
            spaceId: space.sId,
          });
        }
      } else {
        if (body.archive !== undefined) {
          if (body.archive) {
            await metadata.archive();
            if (projectTodoEnabled) {
              void stopProjectTodoWorkflow({
                workspaceId: auth.getNonNullableWorkspace().sId,
                spaceId: space.sId,
              });
            }
          } else {
            await metadata.unarchive();
            if (projectTodoEnabled) {
              void launchOrSignalProjectTodoWorkflow({
                workspaceId: auth.getNonNullableWorkspace().sId,
                spaceId: space.sId,
              });
            }
          }
        }
        if (body.description !== undefined) {
          await metadata.updateDescription(body.description);
        }
        if (body.todoGenerationEnabled !== undefined) {
          await metadata.updateTodoGenerationEnabled(
            body.todoGenerationEnabled
          );
          if (!body.todoGenerationEnabled) {
            await metadata.updateInitialTodoAnalysisLookback(null);
          }
        }
        if (body.initialTodoAnalysisLookback !== undefined) {
          await metadata.updateInitialTodoAnalysisLookback(
            body.initialTodoAnalysisLookback
          );
        }
        if (
          projectTodoEnabled &&
          body.todoGenerationEnabled === true &&
          !priorTodoGenerationEnabled
        ) {
          void launchOrSignalProjectTodoWorkflow({
            workspaceId: auth.getNonNullableWorkspace().sId,
            spaceId: space.sId,
          });
        }
        if (shouldTriggerFirstImmediateSync) {
          void startImmediateProjectTodoWorkflowOnce({
            workspaceId: auth.getNonNullableWorkspace().sId,
            spaceId: space.sId,
          });
        }
      }

      return res.status(200).json({
        projectMetadata: metadata.toJSON(),
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET or PATCH expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
