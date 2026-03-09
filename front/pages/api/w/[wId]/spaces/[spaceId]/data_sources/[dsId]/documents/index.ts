import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { upsertDocument } from "@app/lib/api/data_sources";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import { PostDataSourceDocumentRequestBodySchema } from "@app/types/api/public/data_sources";
import type { CoreAPILightDocument } from "@app/types/core/data_source";
import type { DocumentType } from "@app/types/document";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

// Next.js config requires literal values (static analysis). 16MB accommodates 5MB document content
// (MAX_LARGE_DOCUMENT_TXT_LEN in connectors) plus ~3x JSON encoding overhead for escaping.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "16mb",
    },
  },
};

export type PostDocumentResponseBody = {
  document: DocumentType | CoreAPILightDocument;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostDocumentResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
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

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (
    !dataSource ||
    space.sId !== dataSource.space.sId ||
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

  switch (req.method) {
    case "POST":
      if (!dataSource.canWrite(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message: "You are not allowed to update data in this data source.",
          },
        });
      }

      if (dataSource.connectorId) {
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

      const {
        source_url,
        text,
        section,
        tags,
        parent_id,
        parents,
        timestamp,
        light_document_output,
        mime_type,
        title,
        document_id,
      } = bodyValidation.right;

      const upsertResult = await upsertDocument({
        // Use document_id if provided (e.g., slugified for LLM-friendly node IDs),
        // otherwise fall back to title for backwards compatibility.
        document_id: document_id ?? title,
        source_url,
        text,
        section,
        tags,
        parent_id,
        parents,
        timestamp,
        light_document_output,
        mime_type,
        title,
        dataSource,
        auth,
      });

      if (upsertResult.isErr()) {
        switch (upsertResult.error.code) {
          case "data_source_quota_error":
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "data_source_quota_error",
                message: upsertResult.error.message,
              },
            });
          case "invalid_url":
          case "text_or_section_required":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: upsertResult.error.message,
              },
            });
          case "invalid_parent_id":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: upsertResult.error.message,
              },
            });
          default:
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "There was an error upserting the document.",
              },
            });
        }
      }

      res.status(201).json({
        document: upsertResult.value.document,
      });
      return;
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, { space: { requireCanRead: true } })
);
