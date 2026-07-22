import { findActivationTrigger } from "@app/lib/api/activation/trigger";
import { Authenticator } from "@app/lib/auth";
import { ActivationNudgeModel } from "@app/lib/models/activation/activation_nudge";
import { ActivationPodModel } from "@app/lib/models/activation/activation_pod";
import { ActivationRecommendationModel } from "@app/lib/models/activation/activation_recommendation";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { ProjectMetadataModel } from "@app/lib/resources/storage/models/project_metadata";
import type { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import { Op } from "sequelize";

// Backfills ActivationPod rows for Activation Pods created before ActivationPodResource
// existed (see #29309, #29313), then backfills `activationPodId` on `activation_nudges` and
// `activation_recommendations` rows created before the link existed.
makeScript({}, async ({ execute }, logger) => {
  const activationPodMetadata = await ProjectMetadataModel.findAll({
    where: { provisioningSource: "activation", archivedAt: null },
    // @ts-expect-error.
    // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  const existingActivationPods = await ActivationPodModel.findAll({
    // @ts-expect-error.
    // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });
  const spaceIdsWithActivationPod = new Set(
    existingActivationPods.map((row) => row.spaceId)
  );

  const metadataToBackfill = activationPodMetadata.filter(
    (row) => !spaceIdsWithActivationPod.has(row.spaceId)
  );

  const metadataByWorkspaceId = new Map<ModelId, typeof metadataToBackfill>();
  for (const row of metadataToBackfill) {
    const rows = metadataByWorkspaceId.get(row.workspaceId) ?? [];
    rows.push(row);
    metadataByWorkspaceId.set(row.workspaceId, rows);
  }

  let podsCreated = 0;
  let podsSkipped = 0;

  for (const [workspaceId, rows] of metadataByWorkspaceId) {
    const workspace = await WorkspaceResource.fetchByModelId(workspaceId);
    if (!workspace) {
      logger.warn({ workspaceId }, "Workspace not found, skipping.");
      podsSkipped += rows.length;
      continue;
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId, {
      dangerouslyRequestAllGroups: true,
    });

    const pods = await SpaceResource.fetchByModelIds(
      auth,
      rows.map((row) => row.spaceId)
    );
    const podBySpaceId = new Map(pods.map((pod) => [pod.id, pod]));

    // Resolve every pod's trigger first so we can batch-fetch the editors' UserResources
    // rather than fetching one user at a time.
    const podsWithTrigger: { pod: SpaceResource; trigger: TriggerResource }[] =
      [];
    for (const row of rows) {
      const pod = podBySpaceId.get(row.spaceId);
      if (!pod) {
        logger.warn(
          { workspaceId, spaceId: row.spaceId },
          "Pod space not found, skipping."
        );
        podsSkipped++;
        continue;
      }

      const trigger = await findActivationTrigger(auth, pod);
      if (!trigger) {
        logger.warn(
          { workspaceId, spaceId: row.spaceId },
          "No activation trigger found for pod, skipping."
        );
        podsSkipped++;
        continue;
      }

      podsWithTrigger.push({ pod, trigger });
    }

    const editorModelIds = [
      ...new Set(podsWithTrigger.map(({ trigger }) => trigger.editor)),
    ];
    const editors = await UserResource.fetchByModelIds(editorModelIds);
    const editorByModelId = new Map(editors.map((user) => [user.id, user]));

    for (const { pod, trigger } of podsWithTrigger) {
      const user = editorByModelId.get(trigger.editor);
      if (!user) {
        logger.warn(
          { workspaceId, spaceId: pod.sId, editorModelId: trigger.editor },
          "Trigger editor user not found, skipping."
        );
        podsSkipped++;
        continue;
      }

      logger.info(
        {
          workspaceId,
          spaceId: pod.sId,
          userId: user.sId,
          triggerId: trigger.sId,
        },
        execute ? "Creating ActivationPod." : "Would create ActivationPod."
      );

      if (execute) {
        await ActivationPodResource.makeNew(auth, { pod, user, trigger });
      }
      podsCreated++;
    }
  }

  logger.info({ podsCreated, podsSkipped }, "ActivationPod backfill complete.");

  // Re-fetch so newly created rows (in --execute mode) are included below.
  const allActivationPods = await ActivationPodModel.findAll({
    // @ts-expect-error.
    // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });
  const activationPodIdBySpaceId = new Map(
    allActivationPods.map((row) => [row.spaceId, row.id])
  );

  const nudgesToBackfill = await ActivationNudgeModel.findAll({
    where: { activationPodId: null },
    // @ts-expect-error.
    // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  let nudgesUpdated = 0;
  let nudgesSkipped = 0;
  for (const nudge of nudgesToBackfill) {
    const activationPodId = activationPodIdBySpaceId.get(nudge.spaceId);
    if (!activationPodId) {
      nudgesSkipped++;
      continue;
    }
    if (execute) {
      await nudge.update({ activationPodId });
    }
    nudgesUpdated++;
  }
  logger.info(
    { nudgesUpdated, nudgesSkipped, total: nudgesToBackfill.length },
    "activation_nudges backfill complete."
  );

  // Recommendations don't carry a spaceId directly; derive it from their conversation.
  const recommendationsToBackfill = await ActivationRecommendationModel.findAll(
    {
      where: { activationPodId: null, conversationId: { [Op.ne]: null } },
      // @ts-expect-error.
      // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
      // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    }
  );

  const conversationIds = [
    ...new Set(
      removeNulls(recommendationsToBackfill.map((rec) => rec.conversationId))
    ),
  ];
  const conversations = await ConversationModel.findAll({
    where: { id: conversationIds },
    // @ts-expect-error.
    // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });
  const spaceIdByConversationId = new Map(
    conversations.map((conversation) => [conversation.id, conversation.spaceId])
  );

  let recommendationsUpdated = 0;
  let recommendationsSkipped = 0;
  for (const rec of recommendationsToBackfill) {
    const spaceId = rec.conversationId
      ? spaceIdByConversationId.get(rec.conversationId)
      : null;
    const activationPodId = spaceId
      ? activationPodIdBySpaceId.get(spaceId)
      : null;
    if (!activationPodId) {
      recommendationsSkipped++;
      continue;
    }
    if (execute) {
      await rec.update({ activationPodId });
    }
    recommendationsUpdated++;
  }
  logger.info(
    {
      recommendationsUpdated,
      recommendationsSkipped,
      total: recommendationsToBackfill.length,
    },
    "activation_recommendations backfill complete."
  );
});
