import { syncPoolCreditStateFromBalance } from "@app/lib/api/metronome/credit_state_dispatcher";
import { createPlugin } from "@app/lib/api/poke/types";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { Err, Ok } from "@app/types/shared/result";

export const syncPoolCreditStatePlugin = createPlugin({
  manifest: {
    id: "sync-pool-credit-state",
    name: "Sync Pool Credit State From Balance",
    description:
      "Reconcile the workspace pool credit state with the current Metronome AWU balance. Invalidates the pool credits cache, reads the live balance, and dispatches credits_added or pool_exhausted so the state machine routes to the correct state.",
    resourceTypes: ["workspaces"],
    args: {},
  },
  execute: async (_auth, workspace) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (!workspaceResource) {
      return new Err(new Error(`Workspace not found: wId='${workspace.sId}'`));
    }

    const metronomeCustomerId = workspaceResource.metronomeCustomerId;
    if (!metronomeCustomerId) {
      return new Err(
        new Error(
          `Workspace "${workspace.name}" is not provisioned in Metronome.`
        )
      );
    }

    await syncPoolCreditStateFromBalance({
      workspace: workspaceResource,
      metronomeCustomerId,
    });

    return new Ok({
      display: "text",
      value: `Synced pool credit state from Metronome balance for workspace "${workspace.name}".`,
    });
  },
});
