import { getRedisCacheClient } from "@app/lib/api/redis";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupPermissionModel } from "@app/lib/resources/storage/models/group_permissions";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { makeScript } from "@app/scripts/helpers";

// Until Ultra was added above it, a Premium grant on a group or a user meant "every tier". Ids are
// hardcoded so this script stays a frozen snapshot of that flip whatever the tier table becomes.
const MODELS_TIER_GRANT_TYPE = "use";
const MODELS_TIER_RESOURCE_TYPE = "models_tier";
const PREMIUM_TIER_RESOURCE_ID = 3;
const ULTRA_TIER_RESOURCE_ID = 4;

const GroupPermissionModelWithBypass: ModelStaticWorkspaceAware<GroupPermissionModel> =
  GroupPermissionModel;

makeScript({}, async ({ execute }, logger) => {
  const tierRows = await GroupPermissionModelWithBypass.findAll({
    where: {
      grantType: MODELS_TIER_GRANT_TYPE,
      resourceType: MODELS_TIER_RESOURCE_TYPE,
      resourceId: [PREMIUM_TIER_RESOURCE_ID, ULTRA_TIER_RESOURCE_ID],
    },
    // WORKSPACE_ISOLATION_BYPASS: Migration runs across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  const groupModelIdsOnUltra = new Set(
    tierRows
      .filter((row) => row.resourceId === ULTRA_TIER_RESOURCE_ID)
      .map((row) => row.groupId)
  );
  const premiumRows = tierRows.filter(
    (row) => row.resourceId === PREMIUM_TIER_RESOURCE_ID
  );
  const rowsToPromote = premiumRows.filter(
    (row) => !groupModelIdsOnUltra.has(row.groupId)
  );
  const workspaceModelIds = [
    ...new Set(rowsToPromote.map((row) => row.workspaceId)),
  ];

  logger.info(
    {
      premiumRowCount: premiumRows.length,
      promotedRowCount: rowsToPromote.length,
      skippedRowCount: premiumRows.length - rowsToPromote.length,
      workspaceCount: workspaceModelIds.length,
    },
    `Found ${rowsToPromote.length} Premium tier grants to promote to Ultra.`
  );

  if (!execute || rowsToPromote.length === 0) {
    return;
  }

  // Scoped to the exact ids gathered above, so no workspace isolation bypass is needed.
  await GroupPermissionModelWithBypass.update(
    { resourceId: ULTRA_TIER_RESOURCE_ID },
    { where: { id: rowsToPromote.map((row) => row.id) } }
  );

  // Grants are cached per workspace for up to an hour; drop the hash so the promoted grants are
  // read back immediately.
  const redis = await getRedisCacheClient({
    origin: "group_permissions_cache",
  });
  for (const workspaceModelId of workspaceModelIds) {
    await redis.del(
      GroupPermissionResource.cacheOperations.buildKey({
        workspaceModelId: String(workspaceModelId),
      })
    );
  }

  logger.info(
    { workspaceCount: workspaceModelIds.length },
    "Migration complete."
  );
});
