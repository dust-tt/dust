import { auth_user } from "@app/lib/auth";
import { NextApiRequest, NextApiResponse } from "next";
import { User, DataSource, Provider } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import withLogging from "@app/logger/withlogging";
import { DocumentType } from "@app/types/document";

const { DUST_API } = process.env;

export type GetDocumentResponseBody = {
  document: DocumentType;
};

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
    res.status(authRes.error().status_code).end();
    return;
  }
  let auth = authRes.value();

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
      const documentsRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${dataSource.name}/documents?limit=1&offset=0`,
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
      if (documents.response.total >= 32) {
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
      const upsertRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${dataSource.name}/documents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            document_id: documentId,
            tags: tags,
            text: req.body.text,
            credentials,
          }),
        }
      );

      const data = await upsertRes.json();

      if (data.error) {
        res.status(500).end();
        return;
      }

      res.status(201).json({
        document: data.response.document,
      });
      return;

    case "GET":
      if (!auth.canReadDataSource(dataSource)) {
        res.status(404).end();
        return;
      }

      const documentRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${
          dataSource.name
        }/documents/${encodeURIComponent(documentId)}`,
        {
          method: "GET",
        }
      );

      if (!documentRes.ok) {
        const error = await documentRes.json();
        res.status(400).json(error.error);
        return;
      }

      const document = await documentRes.json();

      res.status(200).json({
        document: document.response.document,
      });
      return;

    case "DELETE":
      if (!auth.canEditDataSource(dataSource)) {
        res.status(401).end();
        return;
      }

      const delRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${
          dataSource.name
        }/documents/${encodeURIComponent(documentId)}`,
        {
          method: "DELETE",
        }
      );

      if (!delRes.ok) {
        const error = await delRes.json();
        res.status(400).json(error.error);
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
