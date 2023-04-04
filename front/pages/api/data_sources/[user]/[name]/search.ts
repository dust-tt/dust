import { NextApiRequest, NextApiResponse } from "next";
import { User, DataSource, Provider, Key } from "@app/lib/models";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { Op } from "sequelize";
import { credentialsFromProviders } from "@app/lib/providers";
import { parse_payload, RequestParseError } from "@app/lib/http_utils";
import { JSONSchemaType } from "ajv";
import { ApiDocument } from "@app/lib/api_models";
import { Result, Ok, Err } from "@app/lib/result";
import { APIErrorWithStatusCode, APIError } from "@app/lib/api/error";

type TagsFilter = {
  is_in?: string[];
  is_not?: string[];
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
  filter?: SearchFilter;
  full_text: boolean;
};

const search_query_schema: JSONSchemaType<DatasourceSearchQuery> = {
  type: "object",
  properties: {
    query: { type: "string" },
    top_k: { type: "number" },
    full_text: { type: "boolean" },
    filter: {
      type: "object",
      nullable: true,
      properties: {
        tags: {
          type: "object",
          nullable: true,
          properties: {
            is_in: { type: "array", items: { type: "string" }, nullable: true },
            is_not: {
              type: "array",
              items: { type: "string" },
              nullable: true,
            },
          },
        },
        timestamp: {
          type: "object",
          nullable: true,
          properties: {
            gt: { type: "number", nullable: true },
            lt: { type: "number", nullable: true },
          },
        },
      },
    },
  },
  required: ["query", "top_k", "full_text"],
};

const { DUST_API } = process.env;

export type DatasourceSearchResponseBody = {
  documents: Array<ApiDocument>;
};

export async function performSearch(
  auth_user: User,
  request_uri_user: User,
  datasource_id: string,
  request_payload: any
): Promise<Result<DatasourceSearchResponseBody, APIErrorWithStatusCode>> {
  const readOnly = auth_user.id != request_uri_user.id;

  let dataSource = await DataSource.findOne({
    where: readOnly
      ? {
          userId: request_uri_user.id,
          name: datasource_id,
          visibility: {
            [Op.or]: ["public"],
          },
        }
      : {
          userId: request_uri_user.id,
          name: datasource_id,
        },
    attributes: [
      "id",
      "name",
      "description",
      "visibility",
      "config",
      "dustAPIProjectId",
      "updatedAt",
    ],
  });

  if (!dataSource) {
    return Err({
      status_code: 404,
      api_error: {
        error: {
          type: "data_source_not_found",
          message: "Data source not found",
        },
      },
    });
  }
  let [providers] = await Promise.all([
    Provider.findAll({
      where: {
        userId: auth_user.id,
      },
    }),
  ]);
  const credentials = credentialsFromProviders(providers);
  let search_query_result = parse_payload(search_query_schema, request_payload);

  if (search_query_result.isErr()) {
    const err = search_query_result.error();
    return Err({
      status_code: 400,
      api_error: {
        error: {
          type: "invalid_request_error",
          message: err.message,
        },
      },
    });
  }
  const search_query = search_query_result.value();

  const searchRes = await fetch(
    `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${dataSource.name}/search`,
    {
      method: "POST",
      body: JSON.stringify({
        query: search_query?.query,
        top_k: search_query?.top_k,
        filter: search_query?.filter,
        full_text: search_query?.full_text,
        credentials: credentials,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!searchRes.ok) {
    const error = await searchRes.json();
    return Err({
      status_code: 400,
      api_error: {
        error: {
          type: "data_source_error",
          message: "There was an error performing the data source search.",
          data_source_error: error.error,
        },
      },
    });
  }
  const documents = await searchRes.json();

  return Ok({
    documents: documents.response.documents,
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DatasourceSearchResponseBody | APIError>
) {
  const session = await getServerSession(req, res, authOptions);

  let request_uri_user = await User.findOne({
    where: {
      username: req.query.user,
    },
  });

  if (!request_uri_user) {
    res.status(404).end();
    return;
  }

  let auth_user = await User.findOne({
    where: {
      githubId: session.provider.id.toString(),
    },
  });

  if (!auth_user) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "POST":
      const request_payload = req.body;
      const search_result = await performSearch(
        auth_user,
        request_uri_user,
        req.query.name as string,
        request_payload
      );
      if (search_result.isOk()) {
        res.status(200).json(search_result.value());
      } else {
        res.status(search_result.error().status_code).end();
      }
      return;
  }
}
