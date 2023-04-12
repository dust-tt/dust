import { auth_user } from "@app/lib/auth";
import { DustAPI, DustAPIDocument } from "@app/lib/dust_api";
import { DataSource, User } from "@app/lib/models";
import withLogging from "@app/logger/withlogging";
import { NextApiRequest, NextApiResponse } from "next";

export type GetDocumentsResponseBody = {
  documents: Array<DustAPIDocument>;
  total: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDocumentsResponseBody>
): Promise<void> {
  let [authRes, dataSourceUser] = await Promise.all([
    auth_user(req, res),
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
  ]);

  if (authRes.isErr()) {
    res.status(authRes.error.status_code).end();
    return;
  }
  let auth = authRes.value;

  if (!dataSourceUser) {
    res.status(404).end();
    return;
  }

  let dataSource = await DataSource.findOne({
    where: {
      userId: dataSourceUser.id,
      name: req.query.name,
    },
  });

  if (!dataSource) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "GET":
      if (!auth.canReadDataSource(dataSource)) {
        res.status(404).end();
        return;
      }

      let limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      let offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const documents = await DustAPI.getDataSourceDocuments(
        dataSource.dustAPIProjectId,
        dataSource.name,
        limit,
        offset
      );

      if (documents.isErr()) {
        res.status(400).end();
        return;
      }

      res.status(200).json({
        documents: documents.value.documents,
        total: documents.value.total,
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
