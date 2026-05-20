import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import {
  launchOrSignalProjectTodoWorkflow,
  startImmediateProjectTodoWorkflowOnce,
  stopProjectTodoWorkflow,
} from "@app/temporal/project_task/client";
import { PatchProjectMetadataBodySchema } from "@app/types/api/internal/spaces";
import { withSpace } from "@front-api/middleware/with_space";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";

// Mounted under /api/w/:wId/spaces/:spaceId/project_metadata. All routes
// require the space to be a project; this is checked inline per handler.
const app = new Hono();

app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Project metadata is only available for project spaces.",
        },
      });
    }

    const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
    return ctx.json({
      projectMetadata: metadata ? metadata.toJSON() : null,
    });
  }
);

app.patch(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", PatchProjectMetadataBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Project metadata is only available for project spaces.",
        },
      });
    }

    if (!space.canAdministrate(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "Only project editors can update project metadata.",
        },
      });
    }

    const body = ctx.req.valid("json");

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

    return ctx.json({ projectMetadata: metadata.toJSON() });
  }
);

export default app;
