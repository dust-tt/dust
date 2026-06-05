import config from "@app/lib/api/config";
import type {
  PokeGetProjectWorkflow,
  PokeProjectWorkflowInfo,
} from "@app/lib/api/poke/projects";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  describeTemporalWorkflow,
  getTemporalClientForFrontNamespace,
} from "@app/lib/temporal";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  projectId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/projects/:projectId/tasks-workflow.
const app = pokeApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeGetProjectWorkflow> => {
    const auth = ctx.get("auth");
    const { projectId } = ctx.req.valid("param");

    const owner = auth.getNonNullableWorkspace();

    const space = await SpaceResource.fetchById(auth, projectId);
    if (!space || !space.isProject()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "Project not found.",
        },
      });
    }

    const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
    const workflowId = `project-todo-${owner.sId}-${space.sId}`;

    const temporalClient = await getTemporalClientForFrontNamespace();

    const description = await describeTemporalWorkflow(temporalClient, {
      workflowId,
    });
    const latestWorkflow: PokeProjectWorkflowInfo | null = description
      ? {
          workflowId,
          runId: description.runId,
          status: description.status.name,
          startTime: description.startTime?.getTime() ?? null,
          closeTime: description.closeTime?.getTime() ?? null,
        }
      : null;

    return ctx.json({
      metadata: metadata ? metadata.toJSON() : null,
      temporalNamespace: config.getTemporalFrontNamespace() ?? "",
      workflowId,
      latestWorkflow,
    });
  }
);

export default app;
