import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import {
  launchOrSignalProjectTodoWorkflow,
  startImmediateProjectTodoWorkflowOnce,
  stopProjectTodoWorkflow,
} from "@app/temporal/project_task/client";
import { PatchProjectMetadataBodySchema } from "@app/types/api/internal/spaces";
import { spaceResource } from "@front-api/middleware/space_resource";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";

// Mounted under /api/w/:wId/spaces/:spaceId/project_metadata. All routes
// require the space to be a project; this is checked inline per handler.
const app = new Hono();

app.get(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");

    if (!space.isProject()) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Project metadata is only available for project spaces.",
        },
      });
    }

    const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
    return c.json({
      projectMetadata: metadata ? metadata.toJSON() : null,
    });
  }
);

app.patch(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  validate("json", PatchProjectMetadataBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");

    if (!space.isProject()) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Project metadata is only available for project spaces.",
        },
      });
    }

    if (!space.canAdministrate(auth)) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Only project editors can update project metadata.",
        },
      });
    }

    const body = c.req.valid("json");

    let metadata = await ProjectMetadataResource.fetchBySpace(auth, space);

    const priorLastTodoAnalysisAt = metadata?.lastTodoAnalysisAt ?? null;
    const priorTodoGenerationEnabled = metadata?.todoGenerationEnabled ?? false;

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
        await metadata.updateTodoGenerationEnabled(body.todoGenerationEnabled);
        if (!body.todoGenerationEnabled) {
          await metadata.updateInitialTodoAnalysisLookback(null);
        }
      }
      if (body.initialTodoAnalysisLookback !== undefined) {
        await metadata.updateInitialTodoAnalysisLookback(
          body.initialTodoAnalysisLookback
        );
      }
      if (body.todoGenerationEnabled === true && !priorTodoGenerationEnabled) {
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

    return c.json({ projectMetadata: metadata.toJSON() });
  }
);

export default app;
