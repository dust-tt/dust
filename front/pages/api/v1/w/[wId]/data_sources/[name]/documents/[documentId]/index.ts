import type {
  CoreAPILightDocument,
  DataSourceType,
  DocumentType,
  WithAPIErrorReponse,
} from "@dust-tt/types";
import {
  PostDataSourceDocumentRequestBodySchema,
  sectionFullText,
} from "@dust-tt/types";
import { dustManagedCredentials } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getDocumentsPostDeleteHooksToRun } from "@app/documents_post_process_hooks/hooks";
import { launchRunPostDeleteHooksWorkflow } from "@app/documents_post_process_hooks/temporal/client";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import {
  enqueueUpsertDocument,
  runPostUpsertHooks,
} from "@app/lib/upsert_document";
import { validateUrl } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

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
  document: DocumentType | CoreAPILightDocument | { document_id: string };
  data_source: DataSourceType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<
      | GetDocumentResponseBody
      | DeleteDocumentResponseBody
      | UpsertDocumentResponseBody
    >
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
  const plan = auth.plan();
  if (!owner || !plan || !auth.isBuilder()) {
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

  const coreAPI = new CoreAPI(logger);
  switch (req.method) {
    case "GET":
      const docRes = await coreAPI.getDataSourceDocument({
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
      if (dataSource.connectorId && !keyRes.value.isSystem) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You cannot upsert a document on a managed data source.",
          },
        });
      }

      const bodyValidation = PostDataSourceDocumentRequestBodySchema.decode(
        req.body
      );
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      let sourceUrl: string | null = null;
      if (bodyValidation.right.source_url) {
        const { valid: isSourceUrlValid, standardized: standardizedSourceUrl } =
          validateUrl(bodyValidation.right.source_url);

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

      const section =
        typeof bodyValidation.right.text === "string"
          ? {
              prefix: null,
              content: bodyValidation.right.text,
              sections: [],
            }
          : bodyValidation.right.section || null;

      if (!section) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Invalid request body, `text` or `section` must be provided.",
          },
        });
      }

      const fullText = sectionFullText(section);

      // Enforce plan limits: DataSource documents count.
      // We only load the number of documents if the limit is not -1 (unlimited).
      // the `getDataSourceDocuments` query involves a SELECT COUNT(*) in the DB that is not
      // optimized, so we avoid it for large workspaces if we know we're unlimited anyway
      if (plan.limits.dataSources.documents.count != -1) {
        const documents = await coreAPI.getDataSourceDocuments({
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
          plan.limits.dataSources.documents.count != -1 &&
          documents.value.total >= plan.limits.dataSources.documents.count
        ) {
          return apiError(req, res, {
            status_code: 401,
            api_error: {
              type: "data_source_quota_error",
              message:
                `Data sources are limited to ${plan.limits.dataSources.documents.count} ` +
                `documents on your current plan. Contact team@dust.tt if you want to increase this limit.`,
            },
          });
        }
      }

      // Enforce plan limits: DataSource document size.
      if (
        plan.limits.dataSources.documents.sizeMb != -1 &&
        fullText.length > 1024 * 1024 * plan.limits.dataSources.documents.sizeMb
      ) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "data_source_quota_error",
            message:
              `Data sources document upload size is limited to ` +
              `${plan.limits.dataSources.documents.sizeMb}MB on your current plan. ` +
              `You are attempting to upload ${fullText.length} bytes. ` +
              `Contact team@dust.tt if you want to increase it.`,
          },
        });
      }

      if (bodyValidation.right.async === true) {
        const enqueueRes = await enqueueUpsertDocument({
          upsertDocument: {
            workspaceId: owner.sId,
            dataSourceName: dataSource.name,
            documentId: req.query.documentId as string,
            tags: bodyValidation.right.tags || [],
            parents: bodyValidation.right.parents || [],
            timestamp: bodyValidation.right.timestamp || null,
            sourceUrl,
            section,
            upsertContext: bodyValidation.right.upsert_context || null,
          },
        });
        if (enqueueRes.isErr()) {
          return apiError(
            req,
            res,
            {
              status_code: 500,
              api_error: {
                type: "data_source_error",
                message:
                  "There was an error enqueueing the the document for asynchronous upsert.",
              },
            },
            enqueueRes.error
          );
        }
        return res.status(200).json({
          document: {
            document_id: req.query.documentId as string,
          },
        });
      } else {
        // Dust managed credentials: all data sources.
        const credentials = dustManagedCredentials();

        // Create document with the Dust internal API.
        const upsertRes = await coreAPI.upsertDataSourceDocument({
          projectId: dataSource.dustAPIProjectId,
          dataSourceName: dataSource.name,
          documentId: req.query.documentId as string,
          tags: bodyValidation.right.tags || [],
          parents: bodyValidation.right.parents || [],
          sourceUrl,
          timestamp: bodyValidation.right.timestamp || null,
          section,
          credentials,
          lightDocumentOutput:
            bodyValidation.right.light_document_output === true,
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

        await runPostUpsertHooks({
          workspaceId: owner.sId,
          dataSource,
          documentId: req.query.documentId as string,
          section,
          document: upsertRes.value.document,
          sourceUrl,
          upsertContext: bodyValidation.right.upsert_context || undefined,
        });
        return;
      }

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

      const delRes = await coreAPI.deleteDataSourceDocument({
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
