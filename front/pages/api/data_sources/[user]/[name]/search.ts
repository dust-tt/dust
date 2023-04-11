import { NextApiRequest, NextApiResponse } from "next";
import { User, DataSource, Provider } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import { parse_payload } from "@app/lib/http_utils";
import { JSONSchemaType } from "ajv";
import { auth_user } from "@app/lib/auth";

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

const { DUST_API } = process.env;

type DatasourceSearchResponseBody = {
  documents: Array<Document>;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DatasourceSearchResponseBody>
): Promise<void> {
  const [authRes, dataSourceUser] = await Promise.all([
    auth_user(req, res),
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
  ]);

  if (authRes.isErr()) {
    res.status(authRes.error().status_code).end();
    return;
  }
  const auth = authRes.value();

  if (!dataSourceUser) {
    res.status(404).end();
    return;
  }

  const dataSource = await DataSource.findOne({
    where: {
      userId: dataSourceUser.id,
      name: req.query.name,
    },
  });

  if (!dataSource) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "GET": {
      // Only the owner of a data source can search in it because:
      // - it is costly. Searching in a data source requires embedding through one of the providers.
      // - It might not be obvious to the users that a search performed
      // on someone else's data source is going to cost money to the user performing the search.
      if (!auth.canEditDataSource(dataSource)) {
        res.status(404).end();
        return;
      }
      // I could not find a way to make the query params be an array if there is only one tag
      if (req.query.tags_in && typeof req.query.tags_in === "string") {
        req.query.tags_in = [req.query.tags_in];
      }
      if (req.query.tags_not && typeof req.query.tags_not === "string") {
        req.query.tags_not = [req.query.tags_not];
      }
      const requestPayload = req.query;

      const [providers] = await Promise.all([
        Provider.findAll({
          where: {
            userId: auth.user().id,
          },
        }),
      ]);
      const credentials = credentialsFromProviders(providers);
      const searchQueryRes = parse_payload(searchQuerySchema, requestPayload);

      if (searchQueryRes.isErr()) {
        res.status(400).end();
        return;
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
        console.log("rust search error", await searchRes.text());
        res.status(400).end();
        return;
      }
      const data = await searchRes.json();

      res.status(200).json({
        documents: data.response.documents,
      });
      return;
    }

    default:
      res.status(405).end();
      break;
  }
}
