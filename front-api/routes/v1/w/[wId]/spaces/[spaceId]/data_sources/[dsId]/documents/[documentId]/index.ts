import apiConfig from "@app/lib/api/config";
import {
  computeWorkspaceOverallSizeCached,
  resolveLegacyDataSourceSpaceId,
} from "@app/lib/api/data_sources";
import {
  getLlmCredentials,
  MISSING_EMBEDDING_API_KEY_ERROR_MESSAGE,
} from "@app/lib/api/provider_credentials";
import { MAX_NODE_TITLE_LENGTH } from "@app/lib/content_nodes_constants";
import { DATASOURCE_QUOTA_PER_SEAT } from "@app/lib/plans/usage/types";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { enqueueUpsertDocument } from "@app/lib/upsert_queue";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import { cleanTimestamp } from "@app/lib/utils/timestamps";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { sectionFullText } from "@app/types/core/data_source";
import { fileSizeToHumanReadable } from "@app/types/files";
import type { LLMCredentialsType } from "@app/types/provider_credential";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { safeSubstring } from "@app/types/shared/utils/string_utils";
import { validateUrl } from "@app/types/shared/utils/url_utils";
import type {
  DeleteDocumentResponseType,
  GetDocumentResponseType,
  UpsertDocumentResponseType,
} from "@dust-tt/client";
import { PostDataSourceDocumentRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

import parents from "./parents";

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
const app = publicApiApp();

app.get("/", async (ctx): HandlerResult<GetDocumentResponseType> => {
  const auth = ctx.get("auth");
  const dsId = ctx.req.param("dsId");
  const documentId = ctx.req.param("documentId");
  if (!dsId || !documentId) {
    return apiError(ctx, {
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

  const spaceId = await resolveLegacyDataSourceSpaceId(
    auth,
    ctx.req.param("spaceId"),
    dataSource
  );

  if (
    !dataSource ||
    dataSource.space.sId !== spaceId ||
    !dataSource.canRead(auth)
  ) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (dataSource.space.kind === "conversations") {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you're trying to access was not found",
      },
    });
  }

  const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
  const docRes = await coreAPI.getDataSourceDocument({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    documentId,
  });

  if (docRes.isErr()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "data_source_error",
        message: "There was an error retrieving the data source document.",
        data_source_error: docRes.error,
      },
    });
  }

  return ctx.json({
    document: docRes.value.document,
  });
});

app.post(
  "/",
  validate("json", PostDataSourceDocumentRequestSchema),
  async (
    ctx
    // The async branch returns just `{ document: { document_id } }` without a
    // `data_source` field — preserving the legacy Next behavior, where Next's
    // loose response typing silently allowed the missing field.
  ): HandlerResult<
    UpsertDocumentResponseType | { document: { document_id: string } }
  > => {
    const auth = ctx.get("auth");
    const dsId = ctx.req.param("dsId");
    const documentId = ctx.req.param("documentId");
    if (!dsId || !documentId) {
      return apiError(ctx, {
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

    const spaceId = await resolveLegacyDataSourceSpaceId(
      auth,
      ctx.req.param("spaceId"),
      dataSource
    );

    if (
      !dataSource ||
      dataSource.space.sId !== spaceId ||
      !dataSource.canRead(auth)
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      });
    }

    if (dataSource.space.kind === "conversations") {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "The space you're trying to access was not found",
        },
      });
    }

    const owner = auth.getNonNullableWorkspace();
    const plan = auth.getNonNullablePlan();

    if (dataSource.connectorId && !auth.isSystemKey()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: "You cannot upsert a document on a managed data source.",
        },
      });
    }

    // To write we must have canWrite or be a systemAPIKey
    if (!(dataSource.canWrite(auth) || auth.isSystemKey())) {
      return apiError(ctx, {
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
        return apiError(ctx, {
          status_code: 429,
          api_error: {
            type: "rate_limit_error",
            message: `You have reached the maximum number of 120 upserts per minute.`,
          },
        });
      }
    }

    const body = ctx.req.valid("json");

    let sourceUrl: string | null = null;
    if (body.source_url) {
      const { valid: isSourceUrlValid, standardized: standardizedSourceUrl } =
        validateUrl(body.source_url);

      if (!isSourceUrlValid) {
        return apiError(ctx, {
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
      typeof body.text === "string"
        ? {
            prefix: null,
            content: body.text,
            sections: [],
          }
        : // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          body.section || null;

    if (!section) {
      return apiError(ctx, {
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
      return apiError(ctx, {
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
        MembershipResource.countActiveSeatsInWorkspace(owner.sId),
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
        return apiError(ctx, {
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
    if (!auth.isSystemKey() && body.parents) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Setting a custom hierarchy is not supported yet. Please omit the parents field.",
        },
      });
    }
    if (!auth.isSystemKey() && body.parent_id) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Setting a custom hierarchy is not supported yet. Please omit the parent_id field.",
        },
      });
    }

    // Enforce parents consistency: we expect users to either not pass them (recommended) or pass them correctly.
    if (body.parents) {
      if (body.parents.length === 0) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid parents: parents must have at least one element.`,
          },
        });
      }
      if (body.parents[0] !== documentId) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid parents: parents[0] should be equal to document_id.`,
          },
        });
      }
      if (
        (body.parents.length >= 2 || body.parent_id !== null) &&
        body.parents[1] !== body.parent_id
      ) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid parent id: parents[1] and parent_id should be equal.`,
          },
        });
      }
    }

    // Enforce a max size on the title: since these will be synced in ES we don't support arbitrarily large titles.
    if (body.title && body.title.length > MAX_NODE_TITLE_LENGTH) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid title: title too long (max ${MAX_NODE_TITLE_LENGTH} characters).`,
        },
      });
    }

    const mimeType = body.mime_type ?? "application/octet-stream";

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const tags = body.tags || [];
    const titleInTags = tags
      .find((t) => t.startsWith("title:"))
      ?.substring(6)
      ?.trim();

    // Use titleInTags if no title is provided, then documentId as last resort (same behavior as uploading in the web app).
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const title = body.title?.trim() || titleInTags || documentId;

    if (!titleInTags) {
      tags.push(`title:${title}`);
    }

    if (titleInTags && titleInTags !== title) {
      logger.warn(
        { dataSourceId: dataSource.sId, documentId, titleInTags, title },
        "Inconsistency between tags and title."
      );
    }

    const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);

    if (body.async === true) {
      const enqueueRes = await enqueueUpsertDocument({
        upsertDocument: {
          workspaceId: owner.sId,
          dataSourceId: dataSource.sId,
          documentId,
          tags,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          parentId: body.parent_id || null,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          parents: body.parents || [documentId],
          timestamp: cleanTimestamp(body.timestamp),
          sourceUrl,
          section,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          upsertContext: body.upsert_context || null,
          title,
          mimeType,
        },
      });
      if (enqueueRes.isErr()) {
        return apiError(
          ctx,
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
      return ctx.json({
        document: {
          document_id: documentId,
        },
      });
    } else {
      let credentials: LLMCredentialsType;
      try {
        credentials = await getLlmCredentials(auth);
      } catch (err) {
        logger.error(
          { error: normalizeError(err) },
          "Failed to get LLM credentials to upsert document"
        );
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: MISSING_EMBEDDING_API_KEY_ERROR_MESSAGE,
          },
        });
      }

      // Create document with the Dust internal API.
      const upsertRes = await coreAPI.upsertDataSourceDocument({
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
        documentId,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        tags: (body.tags || []).map((tag) => safeSubstring(tag, 0)),
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        parentId: body.parent_id || null,
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        parents: body.parents || [documentId],
        sourceUrl,
        timestamp: cleanTimestamp(body.timestamp),
        section,
        credentials,
        lightDocumentOutput: body.light_document_output === true,
        title,
        mimeType,
      });

      if (upsertRes.isErr()) {
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "There was an error upserting the document.",
            data_source_error: upsertRes.error,
          },
        });
      }

      return ctx.json({
        document: upsertRes.value.document,
        data_source: dataSource.toJSON(),
      });
    }
  }
);

app.delete("/", async (ctx): HandlerResult<DeleteDocumentResponseType> => {
  const auth = ctx.get("auth");
  const dsId = ctx.req.param("dsId");
  const documentId = ctx.req.param("documentId");
  if (!dsId || !documentId) {
    return apiError(ctx, {
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

  const spaceId = await resolveLegacyDataSourceSpaceId(
    auth,
    ctx.req.param("spaceId"),
    dataSource
  );

  if (
    !dataSource ||
    dataSource.space.sId !== spaceId ||
    !dataSource.canRead(auth)
  ) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (dataSource.space.kind === "conversations") {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you're trying to access was not found",
      },
    });
  }

  if (dataSource.connectorId && !auth.isSystemKey()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message: "You cannot delete a document from a managed data source.",
      },
    });
  }

  // To write we must have canWrite or be a systemAPIKey
  if (!(dataSource.canWrite(auth) || auth.isSystemKey())) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message: "You are not allowed to update data in this data source.",
      },
    });
  }

  const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
  const delRes = await coreAPI.deleteDataSourceDocument({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    documentId,
  });

  if (delRes.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "There was an error deleting the document.",
        data_source_error: delRes.error,
      },
    });
  }

  return ctx.json({
    document: {
      document_id: documentId,
    },
  });
});

app.route("/parents", parents);

export default app;
