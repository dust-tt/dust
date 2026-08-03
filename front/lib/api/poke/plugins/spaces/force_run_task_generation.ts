import { createPlugin } from "@app/lib/api/poke/types";
import { startImmediateProjectTodoWorkflowOnce } from "@app/temporal/project_task/client";
import { Err, Ok } from "@app/types/shared/result";

export const forceRunTaskGenerationPlugin = createPlugin({
  manifest: {
    id: "force-run-task-generation",
    name: "Force run task generation",
    description:
      "Trigger an immediate task generation run for this project (signals the durable workflow).",
    resourceTypes: ["spaces"],
    args: {
      reason: {
        type: "string",
        label: "Reason",
        description: "Reason for forcing a task generation run",
      },
    },
    requiredRoles: ["support"],
  },
  isApplicableTo: (_auth, space) => space?.isProject() ?? false,
  execute: async (auth, space, args) => {
    if (!space || !space.isProject()) {
      return new Err(new Error("Project not found."));
    }

    const owner = auth.getNonNullableWorkspace();

    await startImmediateProjectTodoWorkflowOnce({
      workspaceId: owner.sId,
      spaceId: space.sId,
    });

    return new Ok({
      display: "text",
      value: `Task generation signaled for project ${space.sId}.`,
    });
  },
});
