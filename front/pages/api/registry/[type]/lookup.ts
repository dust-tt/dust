import type { CoreAPISearchFilter, Result } from "@dust-tt/types";
import { Err, groupHasPermission, Ok } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import logger from "@app/logger/logger";
import { withLogging } from "@app/logger/withlogging";

const { DUST_REGISTRY_SECRET } = process.env;

type LookupDataSourceResponseBody = {
  project_id: number;
  data_source_id: string;
  view_filter: CoreAPISearchFilter | null;
};

/**
 * Notes about the registry lookup service:
 *
 * For DataSources, we could proxy and modify on the fly the config before going to core and replace
 * workspace_id by the internal dust project id but we'll need the same logic for code blocks
 * to execute other dust apps and won't be able to modify on the fly the code, and will need to do
 * it over API from core to front there, so we might as well handle this consistently.
 *
 * But that means we need to pass through the Dust WorkspaceId (of the executor) as header when
 * going to core so that we can retrieve it here and check that the workspace indeed matches the
 * DataSource's owner workspace. This means you can only use your own workspace's DataSources for
 * now.
 *
 * All of this creates an entanglement between core and front but only through this registry lookup
 * service.
 *
 * Note: there is also a problem with private DataSources on public apps, the use of the registry
 * here will prevent leaking them.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LookupDataSourceResponseBody>
): Promise<void> {
  if (!req.headers.authorization) {
    res.status(401).end();
    return;
  }

  const parse = req.headers.authorization.match(/Bearer ([a-zA-Z0-9]+)/);
  if (!parse || !parse[1]) {
    res.status(401).end();
    return;
  }
  const secret = parse[1];

  if (secret !== DUST_REGISTRY_SECRET) {
    res.status(401).end();
    return;
  }

  const dustWorkspaceId = req.headers["x-dust-workspace-id"];
  const rawDustGroupIds = req.headers["x-dust-group-ids"];
  if (
    typeof dustWorkspaceId !== "string" ||
    typeof rawDustGroupIds !== "string"
  ) {
    res.status(400).end();
    return;
  }

  // Temporary instrumentation to track the origin of the request.
  const dustOrigin =
    typeof req.headers["x-dust-origin"] === "string"
      ? req.headers["x-dust-origin"]
      : null;

  const dustGroupIds = rawDustGroupIds.split(",");

  switch (req.method) {
    case "GET":
      switch (req.query.type) {
        case "data_sources":
          const {
            data_source_id: dataSourceOrDataSourceViewId,
            workspace_id: workspaceId,
          } = req.query;

          if (
            typeof workspaceId !== "string" ||
            typeof dataSourceOrDataSourceViewId !== "string"
          ) {
            res.status(400).end();
            return;
          }

          const owner = await Workspace.findOne({
            where: {
              sId: workspaceId,
            },
          });
          if (!owner || dustWorkspaceId !== owner.sId) {
            res.status(404).end();
            return;
          }

          const auth =
            await Authenticator.internalBuilderForWorkspace(workspaceId);

          const groups = await GroupResource.fetchByIds(auth, dustGroupIds);
          if (groups.length === 0) {
            res.status(404).end();
            return;
          }

          if (
            DataSourceViewResource.isDataSourceViewSId(
              dataSourceOrDataSourceViewId
            )
          ) {
            const dataSourceViewRes = await handleDataSourceView(
              auth,
              groups,
              dataSourceOrDataSourceViewId,
              dustOrigin
            );
            if (dataSourceViewRes.isErr()) {
              logger.info(
                {
                  dataSourceViewId: dataSourceOrDataSourceViewId,
                  err: dataSourceViewRes.error,
                  groups: dustGroupIds,
                  workspaceId: dustWorkspaceId,
                },
                "Failed to lookup data source view."
              );
              res.status(404).end();
              return;
            }

            res.status(200).json(dataSourceViewRes.value);
            return;
          } else {
            const dataSourceRes = await handleDataSource(
              auth,
              groups,
              dataSourceOrDataSourceViewId,
              dustOrigin
            );
            if (dataSourceRes.isErr()) {
              logger.info(
                {
                  dataSourceId: dataSourceOrDataSourceViewId,
                  err: dataSourceRes.error,
                  groups: dustGroupIds,
                  workspaceId: dustWorkspaceId,
                },
                "Failed to lookup data source."
              );
              res.status(404).end();
              return;
            }

            res.status(200).json(dataSourceRes.value);
            return;
          }
          return;

        default:
          res.status(405).end();
          return;
      }

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);

async function handleDataSourceView(
  auth: Authenticator,
  groups: GroupResource[],
  dataSourceViewId: string,
  dustOrigin: string | null
): Promise<Result<LookupDataSourceResponseBody, Error>> {
  const dataSourceView = await DataSourceViewResource.fetchById(
    auth,
    dataSourceViewId
  );
  if (!dataSourceView) {
    return new Err(new Error("Data source view not found."));
  }

  // Ensure provided groups can access the data source view.
  const hasAccessToDataSourceView = groups.some((g) =>
    groupHasPermission(dataSourceView.acl(), "read", g.id)
  );
  if (!hasAccessToDataSourceView) {
    logger.info(
      {
        acl: dataSourceView.acl(),
        dataSourceViewId,
        dustOrigin,
        groups: groups.map((g) => g.id),
      },
      "No access to data source view."
    );
  }

  // TODO(2024-08-02 flav) Uncomment.
  // if (hasAccessToDataSourceView) {
  const dataSource = dataSourceView.dataSource;
  return new Ok({
    project_id: parseInt(dataSource.dustAPIProjectId),
    data_source_id: dataSource.name,
    view_filter: {
      tags: null,
      parents: {
        in: dataSourceView.parentsIn,
        not: null,
      },
      timestamp: null,
    },
  });
  // }

  // return new Err(new Error("No access to data source view."));
}

async function handleDataSource(
  auth: Authenticator,
  groups: GroupResource[],
  dataSourceId: string,
  dustOrigin: string | null
): Promise<Result<LookupDataSourceResponseBody, Error>> {
  const dataSource = await DataSourceResource.fetchByName(auth, dataSourceId);
  if (!dataSource) {
    return new Err(new Error("Data source not found."));
  }

  // Until we pass the data source view id for managed data sources, we need to fetch it here.
  // TODO(2024-08-02 flav) Remove once dust apps rely on the data source view id for managed data sources.
  if (dataSource.isManaged()) {
    const globalVault = await VaultResource.fetchWorkspaceGlobalVault(auth);
    const dataSourceView =
      await DataSourceViewResource.listForDataSourcesInVault(
        auth,
        [dataSource],
        globalVault
      );

    return handleDataSourceView(
      auth,
      groups,
      dataSourceView[0].sId,
      dustOrigin
    );
  }

  const hasAccessToDataSource = groups.some((g) =>
    groupHasPermission(dataSource.acl(), "read", g.id)
  );
  if (!hasAccessToDataSource) {
    logger.info(
      {
        acl: dataSource.acl(),
        dataSourceId,
        dustOrigin,
        groups: groups.map((g) => g.id),
      },
      "No access to data source."
    );
  }

  // TODO(2024-08-02 flav) Uncomment.
  // if (hasAccessToDataSource) {
  return new Ok({
    project_id: parseInt(dataSource.dustAPIProjectId),
    data_source_id: dataSource.name,
    view_filter: null,
  });
  // }

  // return new Err(new Error("No access to data source."));
}
