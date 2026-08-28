import { softDeleteSpaceAndLaunchScrubWorkflow } from "@app/lib/api/spaces";
import { Authenticator } from "@app/lib/auth";
import type { ActivationPodKind } from "@app/lib/models/activation/activation_pod";
import { ACTIVATION_POD_KINDS } from "@app/lib/models/activation/activation_pod";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

function isActivationPodKind(value: string): value is ActivationPodKind {
  return (ACTIVATION_POD_KINDS as readonly string[]).includes(value);
}

export type DeleteActivationPodsResult = {
  found: number;
  deleted: number;
  failed: number;
  skipped: number;
};

export async function deleteActivationPodsForWorkspace(
  {
    workspaceId,
    kind,
    execute,
  }: {
    workspaceId: string;
    kind?: ActivationPodKind;
    execute: boolean;
  },
  logger: Logger
): Promise<DeleteActivationPodsResult> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId, {
    dangerouslyRequestAllGroups: true,
  });

  const activationPods = await ActivationPodResource.listForWorkspace(auth, {
    kind,
  });

  if (activationPods.length === 0) {
    logger.info(
      { workspaceId, kind: kind ?? "all" },
      "No live Activation Pods found."
    );
    return {
      found: 0,
      deleted: 0,
      failed: 0,
      skipped: 0,
    };
  }

  const [spaces, users] = await Promise.all([
    SpaceResource.fetchByModelIds(
      auth,
      activationPods.map((activationPod) => activationPod.spaceId)
    ),
    UserResource.fetchByModelIds(
      activationPods.map((activationPod) => activationPod.userId)
    ),
  ]);
  const spaceByModelId = new Map(spaces.map((space) => [space.id, space]));
  const userByModelId = new Map(users.map((user) => [user.id, user]));

  let deleted = 0;
  let failed = 0;
  let skipped = 0;

  for (const activationPod of activationPods) {
    const pod = spaceByModelId.get(activationPod.spaceId);
    const owner = userByModelId.get(activationPod.userId);

    if (!pod) {
      skipped++;
      logger.warn(
        {
          workspaceId,
          activationPodId: activationPod.sId,
          spaceModelId: activationPod.spaceId,
          kind: activationPod.kind,
          ownerUserId: owner?.sId,
        },
        "Activation Pod row has no matching space; skipping."
      );
      continue;
    }

    const logContext = {
      workspaceId,
      activationPodId: activationPod.sId,
      kind: activationPod.kind,
      podId: pod.sId,
      podName: pod.name,
      ownerUserId: owner?.sId,
      ownerEmail: owner?.email,
    };

    if (!execute) {
      logger.info(
        logContext,
        "Would soft-delete Activation Pod and launch the space scrub workflow."
      );
      continue;
    }

    // Force: Activation Pods typically have skills / data sources that would
    // otherwise block deletion. Same path as poke Activation Management
    // force-recreate.
    const deleteResult = await softDeleteSpaceAndLaunchScrubWorkflow(
      auth,
      pod,
      true
    );
    if (deleteResult.isErr()) {
      failed++;
      logger.error(
        { ...logContext, error: deleteResult.error.message },
        "Failed to delete Activation Pod."
      );
      continue;
    }

    deleted++;
    logger.info(
      logContext,
      "Soft-deleted Activation Pod and launched space scrub workflow."
    );
  }

  logger.info(
    {
      workspaceId,
      kind: kind ?? "all",
      execute,
      found: activationPods.length,
      deleted,
      failed,
      skipped,
    },
    execute
      ? "Finished deleting Activation Pods."
      : "Dry run complete. Pass --execute to soft-delete these pods."
  );

  return {
    found: activationPods.length,
    deleted,
    failed,
    skipped,
  };
}

function runScript(): void {
  makeScript(
    {
      workspaceId: {
        alias: "w",
        type: "string",
        describe:
          "The sId of the workspace whose Activation Pods should be deleted.",
        demandOption: true,
      },
      kind: {
        type: "string",
        describe:
          "Optional Activation Pod kind to restrict deletion (`learning` or `goal`). Defaults to all kinds.",
        choices: [...ACTIVATION_POD_KINDS],
      },
    },
    async ({ workspaceId, kind, execute }, logger) => {
      const parsedKind =
        typeof kind === "string" && isActivationPodKind(kind)
          ? kind
          : undefined;

      await deleteActivationPodsForWorkspace(
        { workspaceId, kind: parsedKind, execute },
        logger
      );
    }
  );
}

if (process.argv[1]?.endsWith("delete_activation_pods.ts")) {
  runScript();
}
