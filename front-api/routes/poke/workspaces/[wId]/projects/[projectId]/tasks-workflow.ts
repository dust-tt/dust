import { Hono } from "hono";

import config from "@app/lib/api/config";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import type { ProjectMetadataType } from "@app/types/project_metadata";

import { apiError } from "@front-api/middleware/utils";

export type PokeProjectWorkflowInfo = {
  workflowId: string;
  runId: string;
  status: string;
  startTime: number | null;
  closeTime: number | null;
};

export type PokeGetProjectWorkflow = {
  metadata: ProjectMetadataType | null;
  temporalNamespace: string;
  workflowId: string;
  latestWorkflow: PokeProjectWorkflowInfo | null;
};

// Mounted at /api/poke/workspaces/:wId/projects/:projectId/tasks-workflow.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("projectId");
  if (!projectId) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid project ID.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();

  const space = await SpaceResource.fetchById(auth, projectId);
  if (!space || !space.isProject()) {
    return apiError(c, {
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

  const description = await temporalClient.workflow
    .getHandle(workflowId)
    .describe();
  const latestWorkflow: PokeProjectWorkflowInfo = {
    workflowId,
    runId: description.runId,
    status: description.status.name,
    startTime: description.startTime?.getTime() ?? null,
    closeTime: description.closeTime?.getTime() ?? null,
  };

  const body: PokeGetProjectWorkflow = {
    metadata: metadata ? metadata.toJSON() : null,
    temporalNamespace: config.getTemporalFrontNamespace() ?? "",
    workflowId,
    latestWorkflow,
  };
  return c.json(body);
});

export default app;
