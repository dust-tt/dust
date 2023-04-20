import { JSONSchemaType } from "ajv";
import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getAPIKey } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { APIError } from "@app/lib/error";
import { parse_payload } from "@app/lib/http_utils";
import { Provider } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import { DocumentType } from "@app/types/document";

export type DatasourceSearchQuery = {
  query: string;
  top_k: number;
  full_text: boolean;
  timestamp_gt?: number;
  timestamp_lt?: number;
  tags_in?: string[];
  tags_not?: string[];
};

const searchQuerySchema: JSONSchemaType<DatasourceSearchQuery> = {
  type: "object",
  properties: {
    query: { type: "string" },
    top_k: { type: "number" },
    full_text: { type: "boolean" },
    timestamp_gt: { type: "number", nullable: true },
    timestamp_lt: { type: "number", nullable: true },
    tags_in: { type: "array", items: { type: "string" }, nullable: true },
    tags_not: { type: "array", items: { type: "string" }, nullable: true },
  },
  required: ["query", "top_k", "full_text"],
};

type DatasourceSearchResponseBody = {
  documents: Array<DocumentType>;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DatasourceSearchResponseBody | APIError>
): Promise<void> {
  let keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    const err = keyRes.error;
    return res.status(err.status_code).json(err.api_error);
  }
  let auth = await Authenticator.fromKey(keyRes.value, req.query.wId as string);

  const dataSource = await getDataSource(auth, req.query.name as string);

  if (!dataSource) {
    return res.status(404).json({
      error: {
        type: "data_source_not_found",
        message: "Data source not found",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      if (req.query.tags_in && typeof req.query.tags_in === "string") {
        req.query.tags_in = [req.query.tags_in];
      }
      if (req.query.tags_not && typeof req.query.tags_not === "string") {
        req.query.tags_not = [req.query.tags_not];
      }

      const providers = await Provider.findAll({
        where: {
          workspaceId: keyRes.value.workspaceId,
        },
      });
      const credentials = credentialsFromProviders(providers);

      const queryRes = parse_payload(searchQuerySchema, req.query);
      if (queryRes.isErr()) {
        const err = queryRes.error;
        return res.status(400).json({
          error: {
            type: "invalid_request_error",
            message: err.message,
          },
        });
      }
      const query = queryRes.value;

      const data = await DustAPI.searchDataSource(
        dataSource.dustAPIProjectId,
        dataSource.name,
        {
          query: query.query,
          topK: query.top_k,
          fullText: query.full_text,
          filter: {
            tags: {
              in: query.tags_in,
              not: query.tags_not,
            },
            timestamp: {
              gt: query.timestamp_gt,
              lt: query.timestamp_lt,
            },
          },
          credentials,
        }
      );

      if (data.isErr()) {
        return res.status(400).json({
          error: {
            type: "data_source_error",
            message: "There was an error performing the data source search.",
            data_source_error: data.error,
          },
        });
      }

      res.status(200).json({
        documents: data.value.documents,
      });
      return;
    }

    default:
      res.status(405).json({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
      return;
  }
}
