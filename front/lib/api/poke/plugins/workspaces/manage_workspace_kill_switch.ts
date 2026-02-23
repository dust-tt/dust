import { createPlugin } from "@app/lib/api/poke/types";
import {
  WORKSPACE_KILL_SWITCH_OPERATIONS,
  type WorkspaceKillSwitchOperation,
  WorkspaceResource,
} from "@app/lib/resources/workspace_resource";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

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

    const updateResult = await workspaceResource.updateWorkspaceKillSwitch({
      operation: operationArg,
    });
    if (updateResult.isErr()) {
      return new Err(updateResult.error);
    }
    const { wasUpdated } = updateResult.value;

    switch (operationArg) {
      case "block":
        return new Ok({
          display: "text",
          value: wasUpdated
            ? `Workspace "${workspace.name}" is now fully blocked for emergency maintenance.`
            : `Workspace "${workspace.name}" was already fully blocked for emergency maintenance.`,
        });
      case "unblock":
        return new Ok({
          display: "text",
          value: wasUpdated
            ? `Workspace "${workspace.name}" is now unblocked.`
            : `Workspace "${workspace.name}" was not fully blocked.`,
        });
      default:
        return assertNever(operationArg);
    }
  },
});
