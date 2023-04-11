import { auth_user } from "@app/lib/auth";
import { DataSource, User } from "@app/lib/models";
import withLogging from "@app/logger/withlogging";
import { DocumentType } from "@app/types/document";
import { NextApiRequest, NextApiResponse } from "next";

const { DUST_API } = process.env;

export type GetDocumentsResponseBody = {
  documents: Array<DocumentType>;
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

      const documentsRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${dataSource.name}/documents?limit=${limit}&offset=${offset}`,
        {
          method: "GET",
        }
      );

      if (!documentsRes.ok) {
        const error = await documentsRes.json();
        res.status(400).json(error.error);
        return;
      }

      const documents = await documentsRes.json();

      res.status(200).json({
        documents: documents.response.documents,
        total: documents.response.total,
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
