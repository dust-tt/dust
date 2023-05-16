import { NextApiRequest, NextApiResponse } from "next";

import { DataSource, Workspace } from "@app/lib/models";
import { withLogging } from "@app/logger/withlogging";

const { DUST_REGISTRY_SECRET } = process.env;

type LookupDataSourceResponseBody = {
  project_id: number;
  data_source_id: string;
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

          const dataSource = await DataSource.findOne({
            where: {
              workspaceId: owner.id,
              name: req.query.data_source_id,
            },
          });

          if (!dataSource) {
            res.status(404).end();
            return;
          }

          if (dustWorkspaceId != owner.sId) {
            res.status(404).end();
            return;
          }

          res.status(200).json({
            project_id: parseInt(dataSource.dustAPIProjectId),
            data_source_id: req.query.data_source_id,
          });
          return;

        default:
          res.status(405).end();
          return;
      }
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
