import type {
  DeleteDocumentResponseType,
  GetDocumentResponseType,
  UpsertDocumentResponseType,
} from "@dust-tt/client";
import { PostDataSourceDocumentRequestSchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import apiConfig from "@app/lib/api/config";
import { UNTITLED_TITLE } from "@app/lib/api/content_nodes";
import { computeWorkspaceOverallSizeCached } from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { MAX_NODE_TITLE_LENGTH } from "@app/lib/content_nodes";
import { runDocumentUpsertHooks } from "@app/lib/document_upsert_hooks/hooks";
import { countActiveSeatsInWorkspaceCached } from "@app/lib/plans/usage/seats";
import { DATASOURCE_QUOTA_PER_SEAT } from "@app/lib/plans/usage/types";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { enqueueUpsertDocument } from "@app/lib/upsert_queue";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { cleanTimestamp } from "@app/lib/utils/timestamps";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import {
  CoreAPI,
  dustManagedCredentials,
  fileSizeToHumanReadable,
  safeSubstring,
  sectionFullText,
  validateUrl,
} from "@app/types";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

/**
 * @swagger
 * /api/v1/w/{wId}/spaces/{spaceId}/data_sources/{dsId}/documents/{documentId}:
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
 *         name: spaceId
 *         required: true
 *         description: ID of the space
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
 *         name: spaceId
 *         required: true
 *         description: ID of the space
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
 *               title:
 *                 type: string
 *                 description: The title of the document to upsert.
 *               mime_type:
 *                 type: string
 *                 description: The MIME type of the document to upsert.
 *               text:
 *                 type: string
 *                 description: The text content of the document to upsert.
 *               section:
 *                 $ref: '#/components/schemas/Section'
 *               source_url:
 *                 type: string
 *                 description: The source URL for the document to upsert.
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Tags to associate with the document.
 *               timestamp:
 *                 type: number
 *                 description: Unix timestamp (in milliseconds) for the document (e.g. 1736365559000).
 *               light_document_output:
 *                 type: boolean
 *                 description: If true, a lightweight version of the document will be returned in the response (excluding the text, chunks and vectors). Defaults to false.
 *               async:
 *                 type: boolean
 *                 description: If true, the upsert operation will be performed asynchronously.
 *               upsert_context:
 *                 type: object
 *                 description: Additional context for the upsert operation.
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
 *                 data_source:
 *                   $ref: '#/components/schemas/Datasource'
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
 *       429:
 *         description: Rate limit exceeded.
 *       500:
 *         description: Internal Server Error.
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
 *         name: spaceId
 *         required: true
 *         description: ID of the space
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
 *                   type: object
 *                   properties:
 *                     document_id:
 *                       type: string
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       403:
 *         description: Forbidden. The data source is managed.
 *       404:
 *         description: Data source or document not found.
 *       405:
 *         description: Method not supported.
 *       500:
 *         description: Internal Server Error.
 * components:
 *   schemas:
 *     Section:
 *       type: object
 *       description: A section of a document that can contain nested sections
 *       properties:
 *         prefix:
 *           type: string
 *           nullable: true
 *           description: Optional prefix text for the section
 *         content:
 *           type: string
 *           nullable: true
 *           description: Optional content text for the section
 *         sections:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Section'
 *           description: Array of nested sections
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetDocumentResponseType
      | DeleteDocumentResponseType
      | UpsertDocumentResponseType
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

  // Handling the case where `spaceId` is undefined to keep support for the legacy endpoint (not under
  // space, global space assumed for the auth (the authenticator associated with the app, not the
  // user)).
  let { spaceId } = req.query;
  if (typeof spaceId !== "string") {
    if (auth.isSystemKey()) {
      // We also handle the legacy usage of connectors that taps into connected data sources which
      // are not in the global space. If this is a system key we trust it and set the `spaceId` to the
      // dataSource.space.sId.
      spaceId = dataSource?.space.sId;
    } else {
      spaceId = (await SpaceResource.fetchWorkspaceGlobalSpace(auth)).sId;
    }
  }

  if (
    !dataSource ||
    dataSource.space.sId !== spaceId ||
    !dataSource.canRead(auth)
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (dataSource.space.kind === "conversations") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you're trying to access was not found",
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

      // To write we must have canWrite or be a systemAPIKey
      if (!(dataSource.canWrite(auth) || auth.isSystemKey())) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You are not allowed to update data in this data source.",
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

      const r = PostDataSourceDocumentRequestSchema.safeParse(req.body);

      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }

      let sourceUrl: string | null = null;
      if (r.data.source_url) {
        const { valid: isSourceUrlValid, standardized: standardizedSourceUrl } =
          validateUrl(r.data.source_url);

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
        typeof r.data.text === "string"
          ? {
              prefix: null,
              content: r.data.text,
              sections: [],
            }
          : // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            r.data.section || null;

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

      if (
        plan.limits.dataSources.documents.sizeMb != -1 &&
        fullText.length > 1024 * 1024 * plan.limits.dataSources.documents.sizeMb
      ) {
        return apiError(req, res, {
          status_code: 403,
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

      // Enforce plan limits: Datasource quota
      try {
        const [activeSeats, quotaUsed] = await Promise.all([
          countActiveSeatsInWorkspaceCached(owner.sId),
          computeWorkspaceOverallSizeCached(auth),
        ]);

        if (
          quotaUsed >
          (activeSeats + 1) * DATASOURCE_QUOTA_PER_SEAT // +1 we allow to go over the limit by one additional seat
        ) {
          logger.info(
            {
              workspace: owner.sId,
              datasource_project_id: dataSource.dustAPIProjectId,
              datasource_id: dataSource.dustAPIDataSourceId,
              quota_used: quotaUsed,
              quota_limit: activeSeats * DATASOURCE_QUOTA_PER_SEAT,
            },
            "Datasource quota exceeded for upsert document (overrun expected)"
          );
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "workspace_quota_error",
              message: `You've exceeded your plan limit (${fileSizeToHumanReadable(quotaUsed)} used / ${fileSizeToHumanReadable(activeSeats * DATASOURCE_QUOTA_PER_SEAT)} allowed)`,
            },
          });
        }
      } catch (error) {
        logger.error(
          {
            error,
            workspace: owner.sId,
            datasource_project_id: dataSource.dustAPIProjectId,
            datasource_id: dataSource.dustAPIDataSourceId,
          },
          "Unable to enforce datasource quota"
        );
      }

      // Prohibit passing parents when not coming from connectors.
      if (!auth.isSystemKey() && r.data.parents) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Setting a custom hierarchy is not supported yet. Please omit the parents field.",
          },
        });
      }
      if (!auth.isSystemKey() && r.data.parent_id) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "Setting a custom hierarchy is not supported yet. Please omit the parent_id field.",
          },
        });
      }

      // Enforce parents consistency: we expect users to either not pass them (recommended) or pass them correctly.
      if (r.data.parents) {
        if (r.data.parents.length === 0) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid parents: parents must have at least one element.`,
            },
          });
        }
        if (r.data.parents[0] !== req.query.documentId) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid parents: parents[0] should be equal to document_id.`,
            },
          });
        }
        if (
          (r.data.parents.length >= 2 || r.data.parent_id !== null) &&
          r.data.parents[1] !== r.data.parent_id
        ) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid parent id: parents[1] and parent_id should be equal.`,
            },
          });
        }
      }

      // Enforce a max size on the title: since these will be synced in ES we don't support arbitrarily large titles.
      if (r.data.title && r.data.title.length > MAX_NODE_TITLE_LENGTH) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid title: title too long (max ${MAX_NODE_TITLE_LENGTH} characters).`,
          },
        });
      }

      const documentId = req.query.documentId as string;
      const mimeType = r.data.mime_type ?? "application/octet-stream";

      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const tags = r.data.tags || [];
      const titleInTags = tags
        .find((t) => t.startsWith("title:"))
        ?.substring(6)
        ?.trim();

      // Use titleInTags if no title is provided.
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const title = r.data.title?.trim() || titleInTags || UNTITLED_TITLE;

      if (!titleInTags) {
        tags.push(`title:${title}`);
      }

      if (titleInTags && titleInTags !== title) {
        logger.warn(
          { dataSourceId: dataSource.sId, documentId, titleInTags, title },
          "Inconsistency between tags and title."
        );
      }

      if (r.data.async === true) {
        const enqueueRes = await enqueueUpsertDocument({
          upsertDocument: {
            workspaceId: owner.sId,
            dataSourceId: dataSource.sId,
            documentId,
            tags,
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            parentId: r.data.parent_id || null,
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            parents: r.data.parents || [documentId],
            timestamp: cleanTimestamp(r.data.timestamp),
            sourceUrl,
            section,
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            upsertContext: r.data.upsert_context || null,
            title,
            mimeType,
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
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          tags: (r.data.tags || []).map((tag) => safeSubstring(tag, 0)),
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          parentId: r.data.parent_id || null,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          parents: r.data.parents || [documentId],
          sourceUrl,
          timestamp: cleanTimestamp(r.data.timestamp),
          section,
          credentials,
          lightDocumentOutput: r.data.light_document_output === true,
          title,
          mimeType,
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

        runDocumentUpsertHooks({
          auth,
          dataSourceId: dataSource.sId,
          documentId: req.query.documentId as string,
          documentHash: upsertRes.value.document.hash,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          dataSourceConnectorProvider: dataSource.connectorProvider || null,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          upsertContext: r.data.upsert_context || undefined,
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

      // To write we must have canWrite or be a systemAPIKey
      if (!(dataSource.canWrite(auth) || auth.isSystemKey())) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You are not allowed to update data in this data source.",
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
