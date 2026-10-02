import { apiConfig } from "@connectors/lib/api/config";
import type { Logger } from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  cacheWithRedisResult,
  getHeadersFromRequestedGroupIds,
} from "@connectors/types";
import type { Result } from "@dust-tt/client";
import { DustAPI, Err, Ok } from "@dust-tt/client";

const GLOBAL_GROUP_ID_CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchWorkspaceGlobalGroupId(
  {
    workspaceId,
    workspaceAPIKey,
  }: { workspaceId: string; workspaceAPIKey: string },
  logger: Logger
): Promise<Result<string, Error>> {
  const dustAPI = new DustAPI(
    { url: apiConfig.getDustFrontAPIUrl() },
    { workspaceId, apiKey: workspaceAPIKey },
    logger
  );

  const spacesRes = await dustAPI.getSpaces({ kinds: ["global"] });
  if (spacesRes.isErr()) {
    return new Err(new Error(spacesRes.error.message));
  }

  const [globalSpace] = spacesRes.value;
  if (!globalSpace) {
    return new Err(new Error("Workspace has no global space."));
  }

  const groupIdsRes = await dustAPI.getAutoGroupIdsForSpaces({
    spaceIds: [globalSpace.sId],
  });
  if (groupIdsRes.isErr()) {
    return new Err(new Error(groupIdsRes.error.message));
  }

  const [globalGroupId] = groupIdsRes.value;
  if (!globalGroupId) {
    return new Err(new Error("Workspace has no global group."));
  }

  return new Ok(globalGroupId);
}

const getWorkspaceGlobalGroupId = cacheWithRedisResult(
  fetchWorkspaceGlobalGroupId,
  ({ workspaceId }) => workspaceId,
  { ttlMs: GLOBAL_GROUP_ID_CACHE_TTL_MS }
);

/**
 * @cc [owner:tdraier,label:security] discord-runs-as-company-space-user
 * A Discord caller has no Dust user. Every Discord request to front MUST use this client, which
 * narrows the system key to the workspace global group with the `user` role: it reaches the Company
 * Space only and never runs as a workspace admin or with the system key's unrestricted groups.
 * When the global group cannot be resolved, it MUST fail rather than fall back to the bare key.
 */
export async function makeDiscordDustAPI(
  connector: ConnectorResource,
  logger: Logger
): Promise<Result<DustAPI, Error>> {
  const globalGroupIdRes = await getWorkspaceGlobalGroupId(
    {
      workspaceId: connector.workspaceId,
      workspaceAPIKey: connector.workspaceAPIKey,
    },
    logger
  );
  if (globalGroupIdRes.isErr()) {
    return globalGroupIdRes;
  }

  return new Ok(
    new DustAPI(
      { url: apiConfig.getDustFrontAPIUrl() },
      {
        workspaceId: connector.workspaceId,
        apiKey: connector.workspaceAPIKey,
        extraHeaders: getHeadersFromRequestedGroupIds([globalGroupIdRes.value]),
      },
      logger
    )
  );
}
