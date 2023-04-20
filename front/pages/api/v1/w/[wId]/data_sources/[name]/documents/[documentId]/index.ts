import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { APIError } from "@app/lib/error";
import { Provider } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import { withLogging } from "@app/logger/withlogging";
import { DataSourceType } from "@app/types/data_source";
import { DocumentType } from "@app/types/document";

export type GetDocumentResponseBody = {
  document: DocumentType;
};
export type DeleteDocumentResponseBody = {
  document: {
    document_id: string;
  };
};
export type UpsertDocumentResponseBody = {
  document: DocumentType;
  data_source: DataSourceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | GetDocumentResponseBody
    | DeleteDocumentResponseBody
    | UpsertDocumentResponseBody
    | APIError
  >
): Promise<void> {
  let keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    const err = keyRes.error;
    return res.status(err.status_code).json(err.api_error);
  }
  let auth = await Authenticator.fromKey(keyRes.value, req.query.wId as string);

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
    case "GET":
      const docRes = await DustAPI.getDataSourceDocument(
        dataSource.dustAPIProjectId,
        dataSource.name,
        req.query.documentId as string
      );

      if (docRes.isErr()) {
        return res.status(400).json({
          error: {
            type: "data_source_error",
            message: "There was an error retrieving the data source document.",
            data_source_error: docRes.error,
          },
        });
      }

      res.status(200).json({
        document: docRes.value.document,
      });
      return;

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
            workspaceId: keyRes.value.workspaceId,
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

      let timestamp = null;
      if (req.body.timestamp) {
        if (typeof req.body.timestamp !== "number") {
          res.status(400).json({
            error: {
              type: "invalid_request_error",
              message:
                "Invalid request body, `timestamp` if provided must be a number.",
            },
          });
          return;
        }
        timestamp = req.body.timestamp;
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
      const upsertRes = await DustAPI.upsertDataSourceDocument(
        dataSource.dustAPIProjectId,
        dataSource.name,
        {
          documentId: req.query.documentId as string,
          timestamp,
          tags,
          text: req.body.text,
          credentials,
        }
      );

      if (upsertRes.isErr()) {
        res.status(500).json({
          error: {
            type: "internal_server_error",
            message: "There was an error upserting the document.",
            data_source_error: upsertRes.error,
          },
        });
        return;
      }

      res.status(200).json({
        document: upsertRes.value.document,
        data_source: dataSource,
      });
      return;

    case "DELETE":
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

      const delRes = await DustAPI.deleteDataSourceDocument(
        dataSource.dustAPIProjectId,
        dataSource.name,
        req.query.documentId as string
      );

      if (delRes.isErr()) {
        res.status(500).json({
          error: {
            type: "internal_server_error",
            message: "There was an error deleting the document.",
            data_source_error: delRes.error,
          },
        });
        return;
      }

      res.status(200).json({
        document: {
          document_id: req.query.documentId as string,
        },
      });
      return;

    default:
      res.status(405).json({
        error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, POST or DELETE are expected.",
        },
      });
      return;
  }
}

export default withLogging(handler);
