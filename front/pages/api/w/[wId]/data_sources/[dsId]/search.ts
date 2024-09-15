import type { DocumentType, WithAPIErrorResponse } from "@dust-tt/types";
import { dustManagedCredentials } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { JSONSchemaType } from "ajv";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { parse_payload } from "@app/lib/http_utils";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

export type DatasourceSearchQuery = {
  query: string;
  top_k: number;
  full_text: boolean;
  target_document_tokens?: number;
  timestamp_gt?: number;
  timestamp_lt?: number;
  tags_in?: string[];
  tags_not?: string[];
  parents_in?: string[];
  parents_not?: string[];
};

const searchQuerySchema: JSONSchemaType<DatasourceSearchQuery> = {
  type: "object",
  properties: {
    query: { type: "string" },
    top_k: { type: "number" },
    full_text: { type: "boolean" },
    target_document_tokens: { type: "number", nullable: true },
    timestamp_gt: { type: "number", nullable: true },
    timestamp_lt: { type: "number", nullable: true },
    tags_in: { type: "array", items: { type: "string" }, nullable: true },
    tags_not: { type: "array", items: { type: "string" }, nullable: true },
    parents_in: { type: "array", items: { type: "string" }, nullable: true },
    parents_not: { type: "array", items: { type: "string" }, nullable: true },
  },
  required: ["query", "top_k", "full_text"],
};

export type DatasourceSearchResponseBody = {
  documents: Array<DocumentType>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<DatasourceSearchResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { dsId } = req.query;
  if (typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    dsId,
    // TODO(DATASOURCE_SID): Clean-up
    { origin: "data_source_search" }
  );
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
    case "GET": {
      return handleDataSourceSearch({ req, res, dataSource });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);

export async function handleDataSourceSearch({
  req,
  res,
  dataSource,
}: {
  req: NextApiRequest;
  res: NextApiResponse<WithAPIErrorResponse<DatasourceSearchResponseBody>>;
  dataSource: DataSourceResource;
}) {
  // I could not find a way to make the query params be an array if there is only one tag.
  if (req.query.tags_in && typeof req.query.tags_in === "string") {
    req.query.tags_in = [req.query.tags_in];
  }
  if (req.query.tags_not && typeof req.query.tags_not === "string") {
    req.query.tags_not = [req.query.tags_not];
  }
  const requestPayload = req.query;

  // Dust managed credentials: all data sources.
  const credentials = dustManagedCredentials();

  const searchQueryRes = parse_payload(searchQuerySchema, requestPayload);

  if (searchQueryRes.isErr()) {
    const err = searchQueryRes.error;
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid body sent: ${err.message}`,
      },
    });
  }
  const searchQuery = searchQueryRes.value;

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const data = await coreAPI.searchDataSource(
    dataSource.dustAPIProjectId,
    dataSource.dustAPIDataSourceId,
    {
      query: searchQuery.query,
      topK: searchQuery.top_k,
      fullText: searchQuery.full_text,
      target_document_tokens: searchQuery.target_document_tokens,
      filter: {
        tags: {
          in: searchQuery.tags_in ?? null,
          not: searchQuery.tags_not ?? null,
        },
        parents: {
          in: searchQuery.parents_in ?? null,
          not: searchQuery.parents_not ?? null,
        },
        timestamp: {
          gt: searchQuery.timestamp_gt ?? null,
          lt: searchQuery.timestamp_lt ?? null,
        },
      },
      credentials: credentials,
    }
  );

  if (data.isErr()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "data_source_error",
        message: "There was an error performing the data source search.",
        data_source_error: data.error,
      },
    });
  }

  return res.status(200).json({
    documents: data.value.documents,
  });
}
