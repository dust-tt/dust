import { createPlugin } from "@app/lib/api/poke/types";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

const WORKSPACE_KILL_SWITCH_OPERATIONS = ["block", "unblock"] as const;
type WorkspaceKillSwitchOperation =
  (typeof WORKSPACE_KILL_SWITCH_OPERATIONS)[number];

function isWorkspaceKillSwitchOperation(
  operation: string
): operation is WorkspaceKillSwitchOperation {
  return WORKSPACE_KILL_SWITCH_OPERATIONS.some(
    (allowedOperation) => allowedOperation === operation
  );
}

export const workspaceKillSwitchPlugin = createPlugin({
  manifest: {
    id: "workspace-kill-switch",
    name: "Workspace Kill Switch",
    description:
      "Block or unblock access to all workspace APIs for emergency maintenance.",
    resourceTypes: ["workspaces"],
    args: {
      operation: {
        type: "enum",
        label: "Operation",
        description: "Select whether to block or unblock the workspace",
        values: mapToEnumValues(WORKSPACE_KILL_SWITCH_OPERATIONS, (value) => ({
          label: value,
          value,
        })),
        multiple: false,
      },
    },
  },
  execute: async (_auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const operationArg = args.operation[0];
    if (!operationArg) {
      return new Err(new Error("Please select an operation."));
    }
    if (!isWorkspaceKillSwitchOperation(operationArg)) {
      return new Err(new Error(`Invalid operation: ${operationArg}`));
    }

    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (!workspaceResource) {
      return new Err(new Error(`Workspace not found: wId='${workspace.sId}'`));
    }

    const currentKillSwitch =
      workspaceResource.metadata?.[WorkspaceResource.KILL_SWITCH_METADATA_KEY];
    const isFullyBlocked =
      WorkspaceResource.isWorkspaceKillSwitchedForAllAPIs(currentKillSwitch);
    let metadata: Record<string, string | number | boolean | object> | null =
      null;

    switch (operationArg) {
      case "block":
        if (isFullyBlocked) {
          return new Ok({
            display: "text",
            value: `Workspace "${workspace.name}" was already fully blocked for emergency maintenance.`,
          });
        }

        metadata = {
          ...(workspaceResource.metadata ?? {}),
          [WorkspaceResource.KILL_SWITCH_METADATA_KEY]:
            WorkspaceResource.FULL_WORKSPACE_KILL_SWITCH_VALUE,
        };
        break;
      case "unblock":
        if (!isFullyBlocked) {
          return new Ok({
            display: "text",
            value: `Workspace "${workspace.name}" was not fully blocked.`,
          });
        }

        metadata = { ...(workspaceResource.metadata ?? {}) };
        delete metadata[WorkspaceResource.KILL_SWITCH_METADATA_KEY];
        break;
      default:
        return assertNever(operationArg);
    }

    const updateResult = await WorkspaceResource.updateMetadata(
      workspaceResource.id,
      metadata
    );
    if (updateResult.isErr()) {
      return new Err(updateResult.error);
    }

    return new Ok({
      display: "text",
      value:
        operationArg === "block"
          ? `Workspace "${workspace.name}" is now fully blocked for emergency maintenance.`
          : `Workspace "${workspace.name}" is now unblocked.`,
    });
  },
});
