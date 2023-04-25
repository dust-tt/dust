import { NextApiRequest, NextApiResponse } from "next";

import {
  credentialsFromProviders,
  dustManagedCredentials,
} from "@app/lib/api/credentials";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { Provider } from "@app/lib/models";
import { validateUrl } from "@app/lib/utils";
import { apiError, withLogging } from "@app/logger/withlogging";
import { DataSourceType } from "@app/types/data_source";
import { DocumentType } from "@app/types/document";
import { CredentialsType } from "@app/types/provider";

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
    | ReturnedAPIErrorType
  >
): Promise<void> {
  let keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }
  let auth = await Authenticator.fromKey(keyRes.value, req.query.wId as string);

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const dataSource = await getDataSource(auth, req.query.name as string);

  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const docRes = await DustAPI.getDataSourceDocument(
        dataSource.dustAPIProjectId,
        dataSource.name,
        req.query.documentId as string
      );

      if (docRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
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
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "You can only alter the data souces of the workspaces for which you are a builder.",
          },
        });
      }

      if (dataSource.connector && !keyRes.value.isSystem) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You cannot upsert a document on a managed data source.",
          },
        });
      }

      if (!req.body || !(typeof req.body.text == "string")) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body, `text` (string) is required.",
          },
        });
      }

      let timestamp = null;
      if (req.body.timestamp) {
        if (typeof req.body.timestamp !== "number") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Invalid request body, `timestamp` if provided must be a number.",
            },
          });
        }
        timestamp = req.body.timestamp;
      }

      let tags = [];
      if (req.body.tags) {
        if (!Array.isArray(req.body.tags)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Invalid request body, `tags` if provided must be an array of strings.",
            },
          });
        }
        tags = req.body.tags;
      }

      let sourceUrl: string | null = null;
      if (req.body.sourceUrl) {
        if (typeof req.body.sourceUrl !== "string") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Invalid request body, `sourceUrl` if provided must be a string.",
            },
          });
        }
        const { valid: isSourceUrlValid, standardized: standardizedSourceUrl } =
          validateUrl(req.body.sourceUrl);

        if (!isSourceUrlValid) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Invalid request body, `sourceUrl` if provided must be a valid URL.",
            },
          });
        }
        sourceUrl = standardizedSourceUrl;
      }

      // Enforce plan limits.
      const documents = await DustAPI.getDataSourceDocuments(
        dataSource.dustAPIProjectId,
        dataSource.name,
        1,
        0
      );

      if (documents.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "data_source_error",
            message: "There was an error retrieving the data source.",
            data_source_error: documents.error,
          },
        });
      }

      // Enforce plan limits: DataSource documents count.
      if (
        owner.plan.limits.dataSources.documents.count != -1 &&
        documents.value.total >= owner.plan.limits.dataSources.documents.count
      ) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "data_source_quota_error",
            message:
              "Data sources are limited to 32 documents on our free plan. Contact team@dust.tt if you want to increase this limit.",
          },
        });
      }

      // Enforce plan limits: DataSource document size.
      if (
        owner.plan.limits.dataSources.documents.sizeMb != -1 &&
        req.body.text.length >
          1024 * 1024 * owner.plan.limits.dataSources.documents.sizeMb
      ) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "data_source_quota_error",
            message:
              "Data sources document upload size is limited to 1MB on our free plan. Contact team@dust.tt if you want to increase it.",
          },
        });
      }

      let credentials: CredentialsType | null = null;
      if (keyRes.value.isSystem) {
        // Dust managed credentials: system API key (managed data source).
        credentials = dustManagedCredentials();
      } else {
        let providers = await Provider.findAll({
          where: {
            workspaceId: keyRes.value.workspaceId,
          },
        });
        credentials = credentialsFromProviders(providers);
      }

      // Create document with the Dust internal API.
      const upsertRes = await DustAPI.upsertDataSourceDocument(
        dataSource.dustAPIProjectId,
        dataSource.name,
        {
          documentId: req.query.documentId as string,
          timestamp,
          tags,
          sourceUrl,
          text: req.body.text,
          credentials,
        }
      );

      if (upsertRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "There was an error upserting the document.",
            data_source_error: upsertRes.error,
          },
        });
      }

      res.status(200).json({
        document: upsertRes.value.document,
        data_source: dataSource,
      });
      return;

    case "DELETE":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "You can only alter the data souces of the workspaces for which you are a builder.",
          },
        });
      }

      if (dataSource.connector && !keyRes.value.isSystem) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You cannot delete a document from a managed data source.",
          },
        });
      }

      const delRes = await DustAPI.deleteDataSourceDocument(
        dataSource.dustAPIProjectId,
        dataSource.name,
        req.query.documentId as string
      );

      if (delRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "There was an error deleting the document.",
            data_source_error: delRes.error,
          },
        });
      }

      res.status(200).json({
        document: {
          document_id: req.query.documentId as string,
        },
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, POST, or DELETE is expected.",
        },
      });
  }
}

export default withLogging(handler);
