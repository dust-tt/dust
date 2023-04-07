import { NextApiRequest, NextApiResponse } from "next";
import { auth_api_user } from "@app/lib/auth";
import { APIError } from "@app/lib/error";
import { JSONSchemaType } from "ajv";
import { User, DataSource, Provider } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import { parse_payload } from "@app/lib/http_utils";
import { DocumentType } from "@app/types/document";

const { DUST_API } = process.env;

type TagsFilter = {
  in?: string[];
  not?: string[];
};

type TimestampFilter = {
  gt?: number;
  lt?: number;
};

type SearchFilter = {
  tags?: TagsFilter;
  timestamp?: TimestampFilter;
};

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
  const [authRes, dataSourceUser] = await Promise.all([
    auth_api_user(req),
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
  ]);

  if (authRes.isErr()) {
    const err = authRes.error();
    return res.status(err.status_code).json(err.api_error);
  }
  const auth = authRes.value();

  if (!dataSourceUser) {
    res.status(404).json({
      error: {
        type: "user_not_found",
        message: "The user you're trying to query was not found.",
      },
    });
    return;
  }

  const dataSource = await DataSource.findOne({
    where: {
      userId: dataSourceUser.id,
      name: req.query.name,
    },
  });

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
      if (!auth.canReadDataSource(dataSource)) {
        return res.status(404).json({
          error: {
            type: "data_source_not_found",
            message: "Data source not found",
          },
        });
      }

      // I could not find a way to make the query params be an array if there is only one tag
      if (req.query.tags_in && typeof req.query.tags_in === "string") {
        req.query.tags_in = [req.query.tags_in];
      }
      if (req.query.tags_not && typeof req.query.tags_not === "string") {
        req.query.tags_not = [req.query.tags_not];
      }

      const [providers] = await Promise.all([
        Provider.findAll({
          where: {
            userId: auth.user().id,
          },
        }),
      ]);
      const credentials = credentialsFromProviders(providers);

      const searchQueryRes = parse_payload(searchQuerySchema, req.query);
      if (searchQueryRes.isErr()) {
        const err = searchQueryRes.error();
        return res.status(400).json({
          error: {
            type: "invalid_request_error",
            message: err.message,
          },
        });
      }
      const searchQuery = searchQueryRes.value();

      const filter: SearchFilter = {
        tags: {
          in: searchQuery.tags_in,
          not: searchQuery.tags_not,
        },
        timestamp: {
          gt: searchQuery.timestamp_gt,
          lt: searchQuery.timestamp_lt,
        },
      };

      const serachPayload = {
        query: searchQuery.query,
        top_k: searchQuery.top_k,
        full_text: searchQuery.full_text,
        filter: filter,
        credentials: credentials,
      };

      const searchRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${dataSource.name}/search`,
        {
          method: "POST",
          body: JSON.stringify(serachPayload),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!searchRes.ok) {
        const error = await searchRes.json();
        return res.status(400).json({
          error: {
            type: "data_source_error",
            message: "There was an error performing the data source search.",
            data_source_error: error.error,
          },
        });
      }
      const data = await searchRes.json();

      res.status(200).json({
        documents: data.response.documents,
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
