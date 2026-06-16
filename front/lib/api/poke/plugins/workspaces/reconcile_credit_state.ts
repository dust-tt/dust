import {
  RECONCILE_CREDIT_STATE_TARGETS,
  type ReconcileCreditStateTarget,
  reconcileCreditState,
} from "@app/lib/api/metronome/reconcile_credit_state";
import { createPlugin } from "@app/lib/api/poke/types";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";

function isReconcileTarget(value: string): value is ReconcileCreditStateTarget {
  return RECONCILE_CREDIT_STATE_TARGETS.some((target) => target === value);
}

export const reconcileCreditStatePlugin = createPlugin({
  manifest: {
    id: "reconcile-credit-state",
    name: "Check & Reconcile Credit State",
    description:
      "Debug a workspace credit state machine. Recomputes the state the " +
      "workspace *should* be in from the live source of truth and compares " +
      "it with the persisted state. Pick the target: 'pool' (live Metronome " +
      "AWU balance + PAYG), 'programmatic' (programmatic cap alert evaluation " +
      "states), or 'user' (effective per-user cap vs. usage — requires a User " +
      "sId; only the capped/uncapped dimension is recomputed). 'check' reports " +
      "drift without writing; 'execute' reconciles through the same machinery " +
      "the webhooks use, then reports the before/after states.",
    resourceTypes: ["workspaces"],
    args: {
      target: {
        type: "enum",
        label: "Target",
        description: "Which credit state machine to check/reconcile.",
        values: mapToEnumValues(RECONCILE_CREDIT_STATE_TARGETS, (value) => ({
          label: value,
          value,
        })),
        multiple: false,
      },
      mode: {
        type: "enum",
        label: "Mode",
        description:
          "'check' reports drift only (no write); 'execute' reconciles then reports.",
        values: mapToEnumValues(["check", "execute"], (value) => ({
          label: value,
          value,
        })),
        multiple: false,
      },
      userId: {
        type: "string",
        label: "User sId",
        description: "The user sId to reconcile.",
        dependsOn: { field: "target", value: "user" },
      },
    },
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const targetArg = args.target[0];
    if (!targetArg || !isReconcileTarget(targetArg)) {
      return new Err(new Error("Please select a valid target."));
    }

    const execute = args.mode[0] === "execute";

    const trimmedUserId = args.userId.trim();
    const userId = trimmedUserId === "" ? null : trimmedUserId;
    if (targetArg === "user" && !userId) {
      return new Err(
        new Error("A User sId is required when the target is 'user'.")
      );
    }

    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (!workspaceResource) {
      return new Err(new Error(`Workspace not found: wId='${workspace.sId}'`));
    }

    const { metronomeCustomerId } = workspaceResource;
    if (!metronomeCustomerId) {
      return new Err(
        new Error(
          `Workspace "${workspace.name}" is not provisioned in Metronome.`
        )
      );
    }

    const result = await reconcileCreditState({
      auth,
      workspace: workspaceResource,
      metronomeCustomerId,
      target: targetArg,
      userId,
      execute,
    });
    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok({
      display: "json",
      value: {
        workspace: workspace.name,
        mode: execute ? "execute" : "check",
        ...result.value,
      },
    });
  },
});
