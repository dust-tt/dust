import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { Provider } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import { withLogging } from "@app/logger/withlogging";
import { DocumentType } from "@app/types/document";
import { APIError } from "@app/lib/error";

export type GetDocumentResponseBody = {
  document: DocumentType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDocumentResponseBody | APIError>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    res.status(404).json({
      error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
    return;
  }

  const dataSource = await getDataSource(auth, req.query.name as string);

  if (!dataSource) {
    res.status(404).json({
      error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
    return;
  }

  switch (req.method) {
    case "POST":
      if (!auth.isBuilder()) {
        res.status(401).json({
          error: {
            type: "data_source_auth_error",
            message:
              "You can only alter the data souces of the workspaces for which you are a builder.",
          },
        });
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
        res.status(400).json({
          error: {
            type: "invalid_request_error",
            message: "Invalid request body, `text` (string) is required.",
          },
        });
        return;
      }

      let tags = [];
      if (req.body.tags) {
        if (!Array.isArray(req.body.tags)) {
          res.status(400).json({
            error: {
              type: "invalid_request_error",
              message:
                "Invalid request body, `tags` if provided must be an array of strings.",
            },
          });
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
        res.status(400).json({
          error: {
            type: "data_source_error",
            message: "There was an error retrieving the data source.",
            data_source_error: documents.error,
          },
        });
        return;
      }

      // Enforce plan limits: DataSource documents count.
      if (
        documents.value.total >= owner.plan.limits.dataSources.documents.count
      ) {
        res.status(401).json({
          error: {
            type: "data_source_quota_error",
            message:
              "Data sources are limited to 32 documents on our free plan. Contact team@dust.tt if you want to increase this limit.",
          },
        });
        return;
      }

      // Enforce plan limits: DataSource document size.
      if (
        req.body.text.length >
        1024 * owner.plan.limits.dataSources.documents.sizeMb
      ) {
        res.status(401).json({
          error: {
            type: "data_source_quota_error",
            message:
              "Data sources document upload size is limited to 1MB on our free plan. Contact team@dust.tt if you want to increase it.",
          },
        });
        return;
      }

      let credentials = credentialsFromProviders(providers);

      // Create document with the Dust internal API.
      const data = await DustAPI.upsertDataSourceDocument(
        dataSource.dustAPIProjectId,
        dataSource.name,
        {
          documentId: req.query.documentId as string,
          tags,
          credentials,
          text: req.body.text,
        }
      );
      if (data.isErr()) {
        res.status(500).json({
          error: {
            type: "internal_server_error",
            message: "There was an error upserting the document.",
            data_source_error: data.error,
          },
        });
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
        req.query.documentId as string
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
        req.query.documentId as string
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
