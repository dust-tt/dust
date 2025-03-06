import type { ConnectorProvider, WorkspaceType } from "@dust-tt/types";
import type { DataSourceType } from "@dust-tt/types/src";

import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { LabsTranscriptsConfigurationResource } from "@app/lib/resources/labs_transcripts_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type Logger from "@app/logger/logger";
import type { PostDataSourceRequestBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources";
import { makeScript } from "@app/scripts/helpers";

const PROVIDER = "gong";
const LABS_STORAGE_FEATURE_FLAG = "labs_transcripts_full_storage";

async function getAuthsForWorkspacesWithGong(): Promise<
  { auth: Authenticator; connectionId: string | null }[]
> {
  // Bypassing the resource to get all Gong configurations at once.
  const transcriptsConfigurations =
    await LabsTranscriptsConfigurationResource.model.findAll({
      where: {
        provider: PROVIDER,
      },
      include: [
        {
          model: Workspace,
          as: "workspace",
        },
      ],
    });

  const authsAndConnectionId = [];
  for (const config of transcriptsConfigurations) {
    const auth = await Authenticator.internalAdminForWorkspace(
      config.workspace.sId
    );
    const workspace = auth.getNonNullableWorkspace();

    const flags = await getFeatureFlags(workspace);
    if (flags.includes(LABS_STORAGE_FEATURE_FLAG)) {
      authsAndConnectionId.push({ auth, connectionId: config.connectionId });
    }
  }
  return authsAndConnectionId;
}

async function postDataSource({
  owner,
  systemSpace,
  provider,
  connectionId,
}: {
  owner: WorkspaceType;
  systemSpace: SpaceResource;
  provider: ConnectorProvider;
  connectionId: string;
}): Promise<DataSourceType> {
  const response = await fetch(
    `/api/w/${owner.sId}/spaces/${systemSpace.sId}/data_sources`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider,
        connectionId,
        name: undefined,
        configuration: null,
      } satisfies PostDataSourceRequestBody),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to create data source for workspace ${owner.sId}`);
  }
  const data = await response.json();
  return data.dataSource;
}

async function createAllGongConnectors({
  execute,
  logger,
}: {
  execute: boolean;
  logger: typeof Logger;
}) {
  const auths = await getAuthsForWorkspacesWithGong();
  for (const { auth, connectionId } of auths) {
    const owner = auth.getNonNullableWorkspace();
    const systemSpace = await SpaceResource.fetchWorkspaceSystemSpace(auth);
    logger.info(
      { workspace: owner.sId, space: systemSpace.sId },
      `Found workspace with Gong and ${LABS_STORAGE_FEATURE_FLAG} enabled.`
    );

    if (!connectionId) {
      logger.error(
        { workspace: owner.sId, space: systemSpace.sId },
        `No connectionId found for workspace`
      );
      continue;
    }

    if (execute) {
      const dataSource = await postDataSource({
        owner,
        systemSpace,
        provider: PROVIDER,
        connectionId,
      });
      logger.info(
        { dataSourceId: dataSource.sId, connectorId: dataSource.connectorId },
        "Successfully created Gong connector and dataSource."
      );
    }
  }
}

makeScript({}, async ({ execute }, logger) => {
  await createAllGongConnectors({ execute, logger });
});
