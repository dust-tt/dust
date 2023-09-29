import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { NextApiRequest, NextApiResponse } from "next";

import {
  getDocumentsPostDeleteHooksToRun,
  getDocumentsPostUpsertHooksToRun,
} from "@app/documents_post_process_hooks/hooks";
import {
  launchRunPostDeleteHooksWorkflow,
  launchRunPostUpsertHooksWorkflow,
} from "@app/documents_post_process_hooks/temporal/client";
import { dustManagedCredentials } from "@app/lib/api/credentials";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { CoreAPI, CoreAPILightDocument } from "@app/lib/core_api";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { validateUrl } from "@app/lib/utils";
import { apiError, withLogging } from "@app/logger/withlogging";
import { DataSourceType } from "@app/types/data_source";
import { DocumentType } from "@app/types/document";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

export type GetDocumentResponseBody = {
  document: DocumentType;
};
export type DeleteDocumentResponseBody = {
  document: {
    document_id: string;
  };
};
export type UpsertDocumentResponseBody = {
  // depending on `light_document_output` in the request body
  document: DocumentType | CoreAPILightDocument;
  data_source: DataSourceType;
};

const UpsertContextSchema = t.type({
  sync_type: t.union([
    t.literal("batch"),
    t.literal("incremental"),
    t.undefined,
  ]),
});
export type UpsertContext = t.TypeOf<typeof UpsertContextSchema>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | GetDocumentResponseBody
    | DeleteDocumentResponseBody
    | UpsertDocumentResponseBody
    | ReturnedAPIErrorType
  >
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }
  const { auth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

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
      const docRes = await CoreAPI.getDataSourceDocument({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        documentId: req.query.documentId as string,
      });

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

      if (dataSource.connectorId && !keyRes.value.isSystem) {
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

      let parents = [];
      if (req.body.parents) {
        if (!Array.isArray(req.body.parents)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Invalid request body, `parents` if provided must be an array of strings.",
            },
          });
        }
        parents = req.body.parents;
      }

      let sourceUrl: string | null = null;
      if (req.body.source_url) {
        if (typeof req.body.source_url !== "string") {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "Invalid request body, `source_url` if provided must be a string.",
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
                "Invalid request body, `source_url` if provided must be a valid URL.",
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
              message: "There was an error retrieving the data source.",
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
              "Data sources document upload size is limited to 1MB. Contact team@dust.tt if you want to increase it.",
          },
        });
      }

      // Dust managed credentials: all data sources.
      const credentials = dustManagedCredentials();

      // Create document with the Dust internal API.
      const upsertRes = await CoreAPI.upsertDataSourceDocument({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        documentId: req.query.documentId as string,
        timestamp,
        tags,
        parents,
        sourceUrl,
        text: req.body.text,
        credentials,
        lightDocumentOutput: req.body.light_document_output === true,
      });

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

      const upsertContextValidation = UpsertContextSchema.decode(
        req.body.upsert_context
      );

      let upsertContext: UpsertContext | undefined = undefined;
      if (!isLeft(upsertContextValidation)) {
        upsertContext = upsertContextValidation.right;
      }

      const postUpsertHooksToRun = await getDocumentsPostUpsertHooksToRun({
        auth: await Authenticator.internalBuilderForWorkspace(owner.sId),
        dataSourceName: dataSource.name,
        documentId: req.query.documentId as string,
        documentText: req.body.text,
        documentHash: upsertRes.value.document.hash,
        dataSourceConnectorProvider: dataSource.connectorProvider || null,
        documentSourceUrl: sourceUrl || undefined,
        upsertContext,
      });

      // TODO: parallel.
      for (const { type: hookType, debounceMs } of postUpsertHooksToRun) {
        await launchRunPostUpsertHooksWorkflow(
          dataSource.name,
          owner.sId,
          req.query.documentId as string,
          upsertRes.value.document.hash,
          dataSource.connectorProvider || null,
          hookType,
          debounceMs
        );
      }
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

      if (dataSource.connectorId && !keyRes.value.isSystem) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You cannot delete a document from a managed data source.",
          },
        });
      }

      const delRes = await CoreAPI.deleteDataSourceDocument({
        projectId: dataSource.dustAPIProjectId,
        dataSourceName: dataSource.name,
        documentId: req.query.documentId as string,
      });

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

      const postDeleteHooksToRun = await getDocumentsPostDeleteHooksToRun({
        auth: await Authenticator.internalBuilderForWorkspace(owner.sId),
        dataSourceName: dataSource.name,
        documentId: req.query.documentId as string,
        dataSourceConnectorProvider: dataSource.connectorProvider || null,
      });

      // TODO: parallel.
      for (const { type: hookType } of postDeleteHooksToRun) {
        await launchRunPostDeleteHooksWorkflow(
          dataSource.name,
          owner.sId,
          req.query.documentId as string,
          dataSource.connectorProvider || null,
          hookType
        );
      }

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
