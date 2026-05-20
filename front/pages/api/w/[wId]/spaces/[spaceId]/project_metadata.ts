/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { validatePinnedFramePath } from "@app/lib/api/projects/pinned_frame";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import {
  launchOrSignalProjectTodoWorkflow,
  startImmediateProjectTodoWorkflowOnce,
  stopProjectTodoWorkflow,
} from "@app/temporal/project_task/client";
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
        message: "Pod metadata is only available for Pod spaces.",
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
            message: "Only pod editors can update pod metadata.",
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

      if (body.pinnedFramePath !== undefined) {
        const validation = await validatePinnedFramePath(
          auth,
          space,
          body.pinnedFramePath
        );
        if (validation.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: validation.error.message,
            },
          });
        }
      }

      let metadata = await ProjectMetadataResource.fetchBySpace(auth, space);

      const priorLastTodoAnalysisAt = metadata?.lastTodoAnalysisAt ?? null;
      const priorTodoGenerationEnabled =
        metadata?.todoGenerationEnabled ?? false;

      const shouldTriggerFirstImmediateSync =
        body.todoGenerationEnabled === true &&
        !priorTodoGenerationEnabled &&
        priorLastTodoAnalysisAt === null;

      if (!metadata) {
        metadata = await ProjectMetadataResource.makeNew(auth, space, {
          description: body.description ?? null,
          archivedAt: body.archive ? new Date() : null,
          todoGenerationEnabled: body.todoGenerationEnabled ?? false,
          initialTodoAnalysisLookback: body.initialTodoAnalysisLookback ?? null,
          pinnedFramePath: body.pinnedFramePath ?? null,
        });
        if (!body.archive) {
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

            void stopProjectTodoWorkflow({
              workspaceId: auth.getNonNullableWorkspace().sId,
              spaceId: space.sId,
            });
          } else {
            await metadata.unarchive();

            void launchOrSignalProjectTodoWorkflow({
              workspaceId: auth.getNonNullableWorkspace().sId,
              spaceId: space.sId,
            });
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
        if (body.pinnedFramePath !== undefined) {
          await metadata.updatePinnedFramePath(body.pinnedFramePath);
        }
        if (
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
