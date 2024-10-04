import type {
  CoreAPISearchFilter,
  Result,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { isManaged } from "@app/lib/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

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
  res: NextApiResponse<WithAPIErrorResponse<LookupDataSourceResponseBody>>
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

  if (secret !== config.getDustRegistrySecret()) {
    res.status(401).end();
    return;
  }

  // Extract and validate headers necessary for user permission checks.
  const userWorkspaceId = req.headers["x-dust-workspace-id"];
  const rawDustGroupIds = req.headers["x-dust-group-ids"];
  if (
    typeof userWorkspaceId !== "string" ||
    typeof rawDustGroupIds !== "string"
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing x-dust-workspace-id or x-dust-group-ids header.",
      },
    });
  }

  const dustGroupIds = rawDustGroupIds.split(",");

  switch (req.method) {
    case "GET":
      switch (req.query.type) {
        case "data_sources":
          const notFoundError = () => {
            return apiError(req, res, {
              status_code: 404,
              api_error: {
                type: "data_source_not_found",
                message: "The data source requested was not found.",
              },
            });
          };

          const { data_source_id: dataSourceOrDataSourceViewId } = req.query;
          if (typeof dataSourceOrDataSourceViewId !== "string") {
            return notFoundError();
          }

          const auth = await Authenticator.fromRegistrySecret({
            groupIds: dustGroupIds,
            secret,
            workspaceId: userWorkspaceId,
          });

          if (
            DataSourceViewResource.isDataSourceViewSId(
              dataSourceOrDataSourceViewId
            )
          ) {
            const dataSourceViewRes = await handleDataSourceView(
              auth,
              dataSourceOrDataSourceViewId
            );
            if (dataSourceViewRes.isErr()) {
              logger.info(
                {
                  dataSourceViewId: dataSourceOrDataSourceViewId,
                  err: dataSourceViewRes.error,
                  groups: dustGroupIds,
                  workspaceId: userWorkspaceId,
                },
                "Failed to lookup data source view."
              );
              return notFoundError();
            }

            res.status(200).json(dataSourceViewRes.value);
            return;
          } else {
            const dataSourceRes = await handleDataSource(
              auth,
              dataSourceOrDataSourceViewId
            );
            if (dataSourceRes.isErr()) {
              logger.info(
                {
                  dataSourceId: dataSourceOrDataSourceViewId,
                  err: dataSourceRes.error,
                  groups: dustGroupIds,
                  workspaceId: userWorkspaceId,
                },
                "Failed to lookup data source."
              );
              return notFoundError();
            }

            return res.status(200).json(dataSourceRes.value);
          }

        default:
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Unsupported `type` parameter.",
            },
          });
      }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withLogging(handler);

async function handleDataSourceView(
  auth: Authenticator,
  dataSourceViewId: string
): Promise<Result<LookupDataSourceResponseBody, Error>> {
  const dataSourceView = await DataSourceViewResource.fetchById(
    auth,
    dataSourceViewId
  );
  if (!dataSourceView) {
    return new Err(new Error("Data source view not found."));
  }

  if (dataSourceView.canRead(auth)) {
    const { dataSource } = dataSourceView;

    return new Ok({
      project_id: parseInt(dataSource.dustAPIProjectId),
      data_source_id: dataSource.dustAPIDataSourceId,
      view_filter: {
        tags: null,
        parents: {
          in: dataSourceView.parentsIn,
          not: null,
        },
        timestamp: null,
      },
    });
  }

  return new Err(new Error("No access to data source view."));
}

async function handleDataSource(
  auth: Authenticator,
  dataSourceId: string
): Promise<Result<LookupDataSourceResponseBody, Error>> {
  logger.info(
    {
      dataSource: {
        id: dataSourceId,
      },
      workspace: {
        id: auth.getNonNullableWorkspace().id,
        sId: auth.getNonNullableWorkspace().sId,
      },
    },
    "Looking up registry with data source id"
  );

  const dataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    dataSourceId,
    // TODO(DATASOURCE_SID): Clean-up
    { origin: "registry_lookup" }
  );
  if (!dataSource) {
    return new Err(new Error("Data source not found."));
  }

  // Until we pass the data source view id for managed data sources, we need to fetch it here.
  // TODO(DATASOURCE_SID) Clean-up Remove once dust apps rely on the data source view id for managed data sources.
  if (isManaged(dataSource)) {
    const globalVault = await VaultResource.fetchWorkspaceGlobalVault(auth);
    const dataSourceView =
      await DataSourceViewResource.listForDataSourcesInVault(
        auth,
        [dataSource],
        globalVault
      );

    return handleDataSourceView(auth, dataSourceView[0].sId);
  }

  if (dataSource.canRead(auth)) {
    return new Ok({
      project_id: parseInt(dataSource.dustAPIProjectId),
      data_source_id: dataSource.dustAPIDataSourceId,
      view_filter: null,
    });
  }

  return new Err(new Error("No access to data source."));
}
