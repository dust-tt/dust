import { DocumentType } from "@dust-tt/types";
import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { CoreAPI } from "@app/lib/core_api";
import { withLogging } from "@app/logger/withlogging";

export type GetDocumentsResponseBody = {
  documents: Array<DocumentType>;
  total: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDocumentsResponseBody>
): Promise<void> {
  const session = await getSession(req, res);
  const auth =
    req.query.asDustSuperUser === "true"
      ? await Authenticator.fromSuperUserSession(
          session,
          req.query.wId as string
        )
      : await Authenticator.fromSession(session, req.query.wId as string);

  const owner = auth.workspace();
  if (!owner) {
    res.status(404).end();
    return;
  }

  const dataSource = await getDataSource(auth, req.query.name as string);

  if (!dataSource) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "GET":
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
        : 0;

      const documents = await CoreAPI.getDataSourceDocuments({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        limit,
        offset,
      });

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
