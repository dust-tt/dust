import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { createPlugin } from "@app/lib/api/poke/types";
import {
  deleteWorkspace,
  isWorkspaceRelocationDone,
} from "@app/lib/api/workspace";
import { isFreePlan } from "@app/lib/plans/plan_codes";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { Err, Ok } from "@app/types/shared/result";

export const deleteWorkspacePlugin = createPlugin({
  manifest: {
    id: "delete-workspace",
    name: "Delete Workspace",
    description: "Delete a workspace.",
    resourceTypes: ["workspaces"],
    args: {
      confirmation: {
        type: "string",
        description: "Type 'DELETE' to confirm deletion",
        label: "Type 'DELETE' to confirm",
      },
      workspaceHasBeenRelocated: {
        type: "boolean",
        description:
          "Purge workspace data in this region following a relocation. If true, will ignore " +
          "subscription checks.",
        label: "Workspace has been relocated?",
      },
      deleteDataSources: {
        type: "boolean",
        default: false,
        description:
          "Delete all data sources as part of the workspace deletion.",
        label: "Delete all data sources",
      },
    },
    requiredRoles: ["engineering"],
  },
  execute: async (
    auth,
    workspace,
    { confirmation, workspaceHasBeenRelocated, deleteDataSources }
  ) => {
    if (!workspace) {
      return new Err(new Error("Workspace not found"));
    }

    if (confirmation !== "DELETE") {
      return new Err(new Error("Invalid confirmation, must type 'DELETE'"));
    }

    if (!deleteDataSources) {
      const dataSources = await DataSourceResource.listByWorkspace(auth);
      if (dataSources.length > 0) {
        return new Err(
          new Error(
            'Workspace has data sources. Check "Delete all data sources" to delete them with the workspace.'
          )
        );
      }
    }

    // If the workspace has been relocated, we can delete it immediately.
    if (workspaceHasBeenRelocated) {
      // Ensure that the workspace has been relocated.
      if (!isWorkspaceRelocationDone(workspace)) {
        return new Err(
          new Error(
            "Workspace has not been relocated, please relocate the workspace before deleting it."
          )
        );
      }

      await deleteWorkspace(workspace, {
        deleteDataSources,
        workspaceHasBeenRelocated,
      });
    } else {
      // If the workspace has not been relocated, we need to check its subscription.
      const subscription = auth.getNonNullableSubscription();
      if (!isFreePlan(subscription.plan.code)) {
        return new Err(
          new Error(
            "Workspace has a paid plan, please downgrade to a free plan before deleting the workspace."
          )
        );
      }
      if (subscription.metronomeContractId !== null) {
        return new Err(
          new Error(
            "Workspace has an active Metronome contract, please downgrade the contract before deleting the workspace."
          )
        );
      }

      await deleteWorkspace(workspace, { deleteDataSources });
    }

    void emitAuditLogEvent({
      auth,
      action: "workspace.deleted",
      targets: [buildAuditLogTarget("workspace", workspace)],
      context: getAuditLogContext(auth),
      metadata: {
        relocated: String(workspaceHasBeenRelocated ?? false),
      },
    });

    return new Ok({
      display: "text",
      value: "Workspace scheduled for deletion",
    });
  },
});
