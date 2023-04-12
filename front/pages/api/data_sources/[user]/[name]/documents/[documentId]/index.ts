import { auth_user } from "@app/lib/auth";
import { DustAPI, DustAPIErrorResponse } from "@app/lib/dust_api";
import { DataSource, Provider, User } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import withLogging from "@app/logger/withlogging";
import { DocumentType } from "@app/types/document";
import { NextApiRequest, NextApiResponse } from "next";

export type GetDocumentResponseBody =
  | {
      document: DocumentType;
    }
  | DustAPIErrorResponse;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDocumentResponseBody>
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

  let documentId = req.query.documentId;
  if (!documentId || typeof documentId !== "string") {
    res.status(400).end();
    return;
  }

  switch (req.method) {
    case "POST":
      if (!auth.canEditDataSource(dataSource)) {
        res.status(401).end();
        return;
      }

      let [providers] = await Promise.all([
        Provider.findAll({
          where: {
            userId: auth.user().id,
          },
        }),
      ]);

      if (!req.body || !(typeof req.body.text == "string")) {
        res.status(400).end();
        return;
      }

      let tags = [];
      if (req.body.tags) {
        if (!Array.isArray(req.body.tags)) {
          res.status(400).end();
          return;
        }
        tags = req.body.tags;
      }

      // Enforce FreePlan limit: 32 documents per DataSource.
      const documents = await DustAPI.getDataSourceDocuments(
        dataSource.dustAPIProjectId,
        dataSource.name,
        1,
        0
      );
      if (documents.isErr()) {
        res.status(400).json(documents.error);
        return;
      }
      if (documents.value.total >= 32) {
        res.status(400).end();
        return;
      }

      // Enforce FreePlan limit: 1MB per document.
      if (req.body.text.length > 1024 * 1024) {
        res.status(400).end();
        return;
      }

      let credentials = credentialsFromProviders(providers);

      // Create document with the Dust internal API.
      const data = await DustAPI.upsertDataSourceDocument(
        dataSource.dustAPIProjectId,
        dataSource.name,
        {
          documentId,
          tags,
          credentials,
          text: req.body.text,
        }
      );
      if (data.isErr()) {
        res.status(500).end();
        return;
      }

      res.status(201).json({
        document: data.value.document,
      });
      return;

    case "GET":
      if (!auth.canReadDataSource(dataSource)) {
        res.status(404).end();
        return;
      }

      const document = await DustAPI.getDataSourceDocument(
        dataSource.dustAPIProjectId,
        dataSource.name,
        documentId
      );

      if (document.isErr()) {
        res.status(400).json(document.error);
        return;
      }

      res.status(200).json({
        document: document.value.document,
      });
      return;

    case "DELETE":
      if (!auth.canEditDataSource(dataSource)) {
        res.status(401).end();
        return;
      }

      const deleteResult = await DustAPI.deleteDataSourceDocument(
        dataSource.dustAPIProjectId,
        dataSource.name,
        documentId
      );

      if (deleteResult.isErr()) {
        res.status(400).json(deleteResult.error);
        return;
      }

      res.status(200).end();
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
