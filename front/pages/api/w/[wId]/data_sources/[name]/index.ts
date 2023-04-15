import { Authenticator, getSession } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { DataSource } from "@app/lib/models";
import { withLogging } from "@app/logger/withlogging";
import { DataSourceType } from "@app/types/data_source";
import { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

export type GetDataSourceResponseBody = {
  dataSource: DataSourceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDataSourceResponseBody>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    res.status(404).end();
    return;
  }

  const dataSource = await DataSource.findOne({
    where: auth.isUser()
      ? {
          workspaceId: owner.id,
          visibility: {
            [Op.or]: ["public", "private", "unlisted"],
          },
          name: req.query.name,
        }
      : {
          workspaceId: owner.id,
          // Do not include 'unlisted' here.
          visibility: "public",
          name: req.query.name,
        },
  });

  if (!dataSource) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "GET":
      res.status(200).json({
        dataSource: {
          name: dataSource.name,
          description: dataSource.description,
          visibility: dataSource.visibility,
          config: dataSource.config,
          dustAPIProjectId: dataSource.dustAPIProjectId,
        },
      });
      return;

    case "POST":
      if (!auth.isBuilder()) {
        res.status(401).end();
        return;
      }

      if (
        !req.body ||
        !(typeof req.body.description == "string") ||
        !["public", "private"].includes(req.body.visibility)
      ) {
        res.status(400).end();
        return;
      }

      let description = req.body.description ? req.body.description : null;

      await dataSource.update({
        description,
        visibility: req.body.visibility,
      });

      res.redirect(`/w/${owner.sId}/ds/${dataSource.name}`);
      return;

    case "DELETE":
      if (!auth.isBuilder()) {
        res.status(401).end();
        return;
      }

      const dustDataSource = await DustAPI.deleteDataSource(
        dataSource.dustAPIProjectId,
        dataSource.name
      );

      if (dustDataSource.isErr()) {
        res.status(500).end();
        return;
      }

      await dataSource.destroy();

      res.status(200).end();
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
