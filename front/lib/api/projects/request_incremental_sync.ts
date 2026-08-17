import { default as config } from "@app/lib/api/config";
import { fetchProjectDataSource } from "@app/lib/api/projects/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { SCOPED_PREFIX_POD } from "@app/types/file_system";

/**
 * Fire-and-forget request for a debounced dust_project incremental sync.
 * Failures are logged and never thrown to callers.
 */
export function requestDustProjectIncrementalSync(
  auth: Authenticator,
  space: SpaceResource
): void {
  void (async () => {
    const workspaceId = auth.getNonNullableWorkspace().sId;
    const localLogger = logger.child({
      workspaceId,
      spaceId: space.sId,
    });

    if (!space.isProject()) {
      return;
    }

    const dsRes = await fetchProjectDataSource(auth, space);
    if (dsRes.isErr()) {
      localLogger.warn(
        { error: dsRes.error },
        "Skipping dust_project incremental sync request: data source not found"
      );
      return;
    }

    const connectorId = dsRes.value.connectorId;
    if (!connectorId) {
      localLogger.warn(
        "Skipping dust_project incremental sync request: connectorId missing"
      );
      return;
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const syncRes = await connectorsAPI.requestIncrementalSync(connectorId);
    if (syncRes.isErr()) {
      localLogger.warn(
        { connectorId, error: syncRes.error },
        "Failed to request dust_project incremental sync"
      );
      return;
    }

    localLogger.info(
      { connectorId, workflowId: syncRes.value.workflowId },
      "Requested dust_project incremental sync"
    );
  })().catch((error) => {
    logger.warn(
      {
        workspaceId: auth.workspace()?.sId,
        spaceId: space.sId,
        error,
      },
      "Unexpected error requesting dust_project incremental sync"
    );
  });
}

/**
 * If `scopedPath` is under a pod mount (`pod-{spaceId}/...`), request incremental sync.
 * No-op for conversation/user paths.
 */
export function requestDustProjectIncrementalSyncForScopedPath(
  auth: Authenticator,
  scopedPath: string
): void {
  if (!scopedPath.startsWith(SCOPED_PREFIX_POD)) {
    return;
  }

  const rest = scopedPath.slice(SCOPED_PREFIX_POD.length);
  const slash = rest.indexOf("/");
  const spaceId = slash < 0 ? rest : rest.slice(0, slash);
  if (!spaceId) {
    return;
  }

  void (async () => {
    const space = await SpaceResource.fetchById(auth, spaceId);
    if (!space) {
      logger.warn(
        {
          workspaceId: auth.workspace()?.sId,
          spaceId,
          scopedPath,
        },
        "Skipping dust_project incremental sync request: space not found for scoped path"
      );
      return;
    }
    requestDustProjectIncrementalSync(auth, space);
  })().catch((error) => {
    logger.warn(
      {
        workspaceId: auth.workspace()?.sId,
        spaceId,
        scopedPath,
        error,
      },
      "Unexpected error requesting dust_project incremental sync for scoped path"
    );
  });
}
