import type {
  CoreAPILightDocument,
  DataSourceType,
  DocumentType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import {
  PostDataSourceDocumentRequestBodySchema,
  rateLimiter,
  sectionFullText,
} from "@dust-tt/types";
import { dustManagedCredentials } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import apiConfig from "@app/lib/api/config";
import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import { Authenticator } from "@app/lib/auth";
import { getDocumentsPostDeleteHooksToRun } from "@app/lib/documents_post_process_hooks/hooks";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import {
  enqueueUpsertDocument,
  runPostUpsertHooks,
} from "@app/lib/upsert_queue";
import { validateUrl } from "@app/lib/utils";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import { launchRunPostDeleteHooksWorkflow } from "@app/temporal/documents_post_process_hooks/client";

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

/**
 * @swagger
 * /api/v1/w/{wId}/vaults/{vId}/data_sources/{dsId}/documents/{documentId}:
 *   get:
 *     summary: Retrieve a document from a data source
 *     description: Retrieve a document from a data source identified by {dsId} in the workspace identified by {wId}.
 *     tags:
 *       - Datasources
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: vId
 *         required: true
 *         description: ID of the vault
 *         schema:
 *           type: string
 *       - in: path
 *         name: dsId
 *         required: true
 *         description: ID of the data source
 *         schema:
 *           type: string
 *       - in: path
 *         name: documentId
 *         required: true
 *         description: ID of the document
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: The document
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 document:
 *                   $ref: '#/components/schemas/Document'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       404:
 *         description: Data source or document not found.
 *       500:
 *         description: Internal Server Error.
 *       405:
 *         description: Method not supported.
 *   post:
 *     summary: Upsert a document in a data source
 *     description: Upsert a document in a data source in the workspace identified by {wId}.
 *     tags:
 *       - Datasources
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: vId
 *         required: true
 *         description: ID of the vault
 *         schema:
 *           type: string
 *       - in: path
 *         name: dsId
 *         required: true
 *         description: ID of the data source
 *         schema:
 *           type: string
 *       - in: path
 *         name: documentId
 *         required: true
 *         description: ID of the document
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text:
 *                 type: string
 *                 description: The text content of the document to upsert.
 *               source_url:
 *                 type: string
 *                 description: The source URL for the document to upsert.
 *               light_document_output:
 *                 type: boolean
 *                 description: If true, a lightweight version of the document will be returned in the response (excluding the text, chunks and vectors). Defaults to false.
 *     responses:
 *       200:
 *         description: The document
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 document:
 *                   $ref: '#/components/schemas/Document'
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       403:
 *         description: Forbidden. The data source is managed.
 *       404:
 *         description: Data source or document not found.
 *       405:
 *         description: Method not supported.
 *   delete:
 *     summary: Delete a document from a data source
 *     description: Delete a document from a data source in the workspace identified by {wId}.
 *     tags:
 *       - Datasources
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: vId
 *         required: true
 *         description: ID of the vault
 *         schema:
 *           type: string
 *       - in: path
 *         name: dsId
 *         required: true
 *         description: ID of the data source
 *         schema:
 *           type: string
 *       - in: path
 *         name: documentId
 *         required: true
 *         description: ID of the document
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: The document
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       403:
 *         description: Forbidden. The data source is managed.
 *       404:
 *         description: Data source or document not found.
 *       405:
 *         description: Method not supported.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetDocumentResponseBody
      | DeleteDocumentResponseBody
      | UpsertDocumentResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const { dsId } = req.query;
  if (typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    dsId,
    // TODO(DATASOURCE_SID): Clean-up
    { origin: "v1_data_sources_documents_document_get_or_upsert" }
  );

  // Handling the case where vId is undefined to keep support for the legacy endpoint (not under
  // vault, global vault assumed for the auth (the authenticator associated with the app, not the
  // user)).
  let { vId } = req.query;
  if (typeof vId !== "string") {
    if (auth.isSystemKey()) {
      // We also handle the legacy usage of connectors that taps into connected data sources which
      // are not in the global vault. If this is a system key we trust it and set the vId to the
      // dataSource.vault.sId.
      vId = dataSource?.vault.sId;
    } else {
      vId = (await VaultResource.fetchWorkspaceGlobalVault(auth)).sId;
    }
  }

  if (!dataSource || dataSource.vault.sId !== vId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const owner = auth.getNonNullableWorkspace();
  const plan = auth.getNonNullablePlan();

  const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
  switch (req.method) {
    case "GET":
      const docRes = await coreAPI.getDataSourceDocument({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
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
      if (dataSource.connectorId && !auth.isSystemKey()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You cannot upsert a document on a managed data source.",
          },
        });
      }

      if (!auth.isSystemKey()) {
        const remaining = await rateLimiter({
          key: `upsert-document-w-${owner.sId}`,
          maxPerTimeframe: 120,
          timeframeSeconds: 60,
          logger,
        });
        if (remaining <= 0) {
          return apiError(req, res, {
            status_code: 429,
            api_error: {
              type: "rate_limit_error",
              message: `You have reached the maximum number of 120 upserts per minute.`,
            },
          });
        }
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
        const documents = await coreAPI.getDataSourceDocuments(
          {
            projectId: dataSource.dustAPIProjectId,
            dataSourceId: dataSource.dustAPIDataSourceId,
          },
          { limit: 1, offset: 0 }
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
                `documents on your current plan. Contact support@dust.tt if you want to increase this limit.`,
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
              `Contact support@dust.tt if you want to increase it.`,
          },
        });
      }

      if (bodyValidation.right.async === true) {
        const enqueueRes = await enqueueUpsertDocument({
          upsertDocument: {
            workspaceId: owner.sId,
            dataSourceId: dataSource.sId,
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
        // Data source operations are performed with our credentials.
        const credentials = dustManagedCredentials();

        // Create document with the Dust internal API.
        const upsertRes = await coreAPI.upsertDataSourceDocument({
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
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
          data_source: dataSource.toJSON(),
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
      if (dataSource.connectorId && !auth.isSystemKey()) {
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
        dataSourceId: dataSource.dustAPIDataSourceId,
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
        auth: await Authenticator.internalAdminForWorkspace(owner.sId),
        dataSourceId: dataSource.sId,
        documentId: req.query.documentId as string,
        dataSourceConnectorProvider: dataSource.connectorProvider || null,
      });

      // TODO: parallel.
      for (const { type: hookType } of postDeleteHooksToRun) {
        await launchRunPostDeleteHooksWorkflow(
          owner.sId,
          dataSource.sId,
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

export default withPublicAPIAuthentication(handler);
