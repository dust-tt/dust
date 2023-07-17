import { NextApiRequest, NextApiResponse } from "next";

import { dustManagedCredentials } from "@app/lib/api/credentials";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { CoreAPI } from "@app/lib/core_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { validateUrl } from "@app/lib/utils";
import { apiError, withLogging } from "@app/logger/withlogging";
import { DocumentType } from "@app/types/document";

export type GetDocumentResponseBody = {
  document: DocumentType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDocumentResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The Data Source you requested was not found.",
      },
    });
  }

  const dataSource = await getDataSource(auth, req.query.name as string);

  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The Data Source you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      if (!auth.isBuilder() && !dataSource.userUpsertable) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "You can only alter the data souces of the workspaces for which you are a builder.",
          },
        });
      }

      if (dataSource.connectorId) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You cannot upsert a document on a managed Data Source.",
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
      if (req.body.source_url) {
        if (typeof req.body.source_url !== "string") {
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
          validateUrl(req.body.source_url);

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

      // Enforce plan limits: DataSource documents count.
      // We only load the number of documents if the limit is not -1 (unlimited).
      // the `getDataSourceDocuments` query involves a SELECT COUNT(*) in the DB that is not
      // optimized, so we avoid it for large workspaces if we know we're unlimited anyway
      if (owner.plan.limits.dataSources.documents.count != -1) {
        const documents = await CoreAPI.getDataSourceDocuments({
          projectId: dataSource.dustAPIProjectId,
          dataSourceName: dataSource.name,
          limit: 1,
          offset: 0,
        });
        if (documents.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "data_source_error",
              message: "There was an error retrieving the Data Source.",
              data_source_error: documents.error,
            },
          });
        }

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

      // Dust managed credentials: all data sources.
      const credentials = dustManagedCredentials();

      // Create document with the Dust internal API.
      const data = await CoreAPI.upsertDataSourceDocument({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        documentId: req.query.documentId as string,
        tags,
        sourceUrl,
        credentials,
        text: req.body.text,
      });
      if (data.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "There was an error upserting the document.",
            data_source_error: data.error,
          },
        });
      }

      res.status(201).json({
        document: data.value.document,
      });
      return;

    case "GET":
      const document = await CoreAPI.getDataSourceDocument({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        documentId: req.query.documentId as string,
      });

      if (document.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "data_source_error",
            message:
              "There was an error retrieving the Data Source's document.",
            data_source_error: document.error,
          },
        });
      }

      res.status(200).json({
        document: document.value.document,
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

      if (dataSource.connectorId) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You cannot delete a document from a managed Data Source.",
          },
        });
      }

      const deleteRes = await CoreAPI.deleteDataSourceDocument({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        documentId: req.query.documentId as string,
      });

      if (deleteRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "There was an error deleting the document.",
            data_source_error: deleteRes.error,
          },
        });
      }

      res.status(204).end();
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, POST or DELETE is expected.",
        },
      });
  }
}

export default withLogging(handler);
