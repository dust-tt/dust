import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { makeScript } from "@app/scripts/helpers";
import {
  analyzeProjectTodosActivity,
  mergeTodosForProjectActivity,
} from "@app/temporal/project_todo/activities";
import { QUEUE_NAME } from "@app/temporal/project_todo/config";
import { v4 as uuidv4 } from "uuid";

makeScript(
  {
    workspaceId: {
      alias: "wId",
      type: "string",
      demandOption: true,
      description: "Workspace sId.",
    },
    spaceId: {
      alias: "pId",
      type: "string",
      demandOption: true,
      description: "Project space sId.",
    },
  },
  async ({ execute, workspaceId, spaceId }, logger) => {
    const adminAuth =
      await Authenticator.internalAdminForWorkspace(workspaceId);
    const space = await SpaceResource.fetchById(adminAuth, spaceId);

    if (!space) {
      throw new Error(`Space not found: ${spaceId}`);
    }
    if (!space.isProject()) {
      throw new Error(`Space ${spaceId} is not a project.`);
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId, {
      dangerouslyRequestAllGroups: true,
    });

    if (!auth) {
      throw new Error("Failed to create authenticator for workspace");
    }

    const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
    if (metadata?.archivedAt) {
      logger.warn(
        { workspaceId, spaceId },
        "Project is archived; launching one-off run anyway for dev."
      );
    }

    const oneOffWorkflowId = `project-todo-oneoff-${workspaceId}-${spaceId}-${Date.now()}`;

    logger.info(
      {
        workspaceId,
        spaceId: space.sId,
        workflowId: oneOffWorkflowId,
        taskQueue: QUEUE_NAME,
      },
      execute
        ? "Launching immediate one-off project todo workflow."
        : "Dry run: would launch immediate one-off project todo workflow."
    );

    if (!execute) {
      return;
    }

    const runId = uuidv4();
    await analyzeProjectTodosActivity({ workspaceId, spaceId, runId });
    await mergeTodosForProjectActivity({ workspaceId, spaceId, runId });
  }
);
