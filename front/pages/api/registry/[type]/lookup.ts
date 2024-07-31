import type { CoreAPISearchFilter } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceResource } from "@app/lib/resources/datasource_resource";
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

  if (!req.headers["x-dust-workspace-id"]) {
    res.status(400).end();
    return;
  }

  // TODO(GROUPS_INFRA): Add x-dust-group-ids header retrieval
  //  - If not set default to the global workspace group
  //  - Enforce checks for access to data sources and data sources view below

  const dustWorkspaceId = req.headers["x-dust-workspace-id"] as string;

  switch (req.method) {
    case "GET":
      switch (req.query.type) {
        case "data_sources":
          if (
            typeof req.query.workspace_id !== "string" ||
            typeof req.query.data_source_id !== "string"
          ) {
            res.status(400).end();
            return;
          }

          const owner = await Workspace.findOne({
            where: {
              sId: req.query.workspace_id,
            },
          });

          if (!owner) {
            res.status(404).end();
            return;
          }
          const auth = await Authenticator.internalBuilderForWorkspace(
            req.query.workspace_id
          );
          const dataSource = await DataSourceResource.fetchByName(
            auth,
            req.query.data_source_id
          );

          if (!dataSource) {
            res.status(404).end();
            return;
          }

          if (dustWorkspaceId != owner.sId) {
            res.status(404).end();
            return;
          }

          // TODO(GROUPS_INFRA):
          // - Implement view_filter return when a data source view is looked up.
          // - If data_source_ids is of the form `dsv_...` then it's a data source view
          //   and we pull the view_filter to return it below
          // - otherwise it's data source and the view_filter is null
          // - Obviously this is where we check based on the x-dust-group-ids header that we
          //   have access to the data source or data source view

          res.status(200).json({
            project_id: parseInt(dataSource.dustAPIProjectId),
            data_source_id: req.query.data_source_id,
            view_filter: null,
          });
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
