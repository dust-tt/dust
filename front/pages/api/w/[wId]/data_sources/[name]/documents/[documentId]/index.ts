import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { Provider } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import { withLogging } from "@app/logger/withlogging";
import { DocumentType } from "@app/types/document";
import { NextApiRequest, NextApiResponse } from "next";

export type GetDocumentResponseBody = {
  document: DocumentType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDocumentResponseBody>
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

  const dataSource = await getDataSource(auth, req.query.name as string);

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
      if (!auth.isBuilder()) {
        res.status(401).end();
        return;
      }

      let [providers] = await Promise.all([
        Provider.findAll({
          where: {
            workspaceId: owner.id,
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

      // Enforce plan limits.
      const documents = await DustAPI.getDataSourceDocuments(
        dataSource.dustAPIProjectId,
        dataSource.name,
        1,
        0
      );
      if (documents.isErr()) {
        res.status(400).end();
        return;
      }

      // Enforce plan limits: DataSource documents count.
      if (documents.value.total >= owner.plan.limits.dataSources.count) {
        res.status(400).end();
        return;
      }

      // Enforce plan limits: DataSource document size.
      if (
        req.body.text.length >
        1024 * owner.plan.limits.dataSources.documents.sizeMb
      ) {
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
      const document = await DustAPI.getDataSourceDocument(
        dataSource.dustAPIProjectId,
        dataSource.name,
        documentId
      );

      if (document.isErr()) {
        res.status(400).end();
        return;
      }

      res.status(200).json({
        document: document.value.document,
      });
      return;

    case "DELETE":
      if (!auth.isBuilder()) {
        res.status(401).end();
        return;
      }

      const deleteResult = await DustAPI.deleteDataSourceDocument(
        dataSource.dustAPIProjectId,
        dataSource.name,
        documentId
      );

      if (deleteResult.isErr()) {
        res.status(400).end();
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
