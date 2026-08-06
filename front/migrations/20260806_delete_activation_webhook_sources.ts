import { deleteWebhookSource } from "@app/lib/api/webhook_source";
import { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

// Activation nudges are posted directly, so the shared webhook source, its
// per-pod views and the triggers hanging off them serve nothing. Deleting the
// source takes all three (see `deleteWebhookSource`).
const ACTIVATION_WEBHOOK_SOURCE_NAME = "Activation";

async function deleteActivationWebhookSource(
  workspaceId: string,
  { execute, logger }: { execute: boolean; logger: Logger }
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId, {
    dangerouslyRequestAllGroups: true,
  });

  const source = await WebhookSourceResource.fetchByName(
    auth,
    ACTIVATION_WEBHOOK_SOURCE_NAME
  );
  if (!source) {
    logger.info({ workspaceId }, "No Activation webhook source, skipping.");
    return;
  }

  if (!execute) {
    logger.info(
      { workspaceId, webhookSourceId: source.sId },
      "Would delete the Activation webhook source, its views and triggers."
    );
    return;
  }

  const deleteRes = await deleteWebhookSource(auth, source);
  if (deleteRes.isErr()) {
    logger.error(
      { workspaceId, webhookSourceId: source.sId, error: deleteRes.error },
      "Failed to delete the Activation webhook source."
    );
    return;
  }

  logger.info(
    { workspaceId, webhookSourceId: source.sId },
    "Deleted the Activation webhook source."
  );
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      demandOption: false,
      type: "string" as const,
    },
  },
  async ({ workspaceId, execute }, logger) => {
    if (workspaceId) {
      await deleteActivationWebhookSource(workspaceId, { execute, logger });
      return;
    }

    const workspaceModelIds =
      await ActivationPodResource.listWorkspaceModelIdsWithActivationPods();
    const workspaces =
      await WorkspaceResource.fetchByModelIds(workspaceModelIds);

    for (const workspace of workspaces) {
      await deleteActivationWebhookSource(workspace.sId, { execute, logger });
    }
  }
);
