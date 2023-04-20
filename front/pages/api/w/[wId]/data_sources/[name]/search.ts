import { JSONSchemaType } from "ajv";
import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
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
  res: NextApiResponse<DatasourceSearchResponseBody>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    res.status(404).end();
    return;
  }

  const dataSource = await getDataSource(auth, req.query.name as string);

  if (!dataSource) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "GET": {
      // Only member of the workspace can search a DataSource since it costs money for embedding.
      if (!auth.isUser()) {
        res.status(404).end();
        return;
      }

      // I could not find a way to make the query params be an array if there is only one tag.
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
            workspaceId: owner.id,
          },
        }),
      ]);
      const credentials = credentialsFromProviders(providers);
      const searchQueryRes = parse_payload(searchQuerySchema, requestPayload);

      if (searchQueryRes.isErr()) {
        res.status(400).end();
        return;
      }
      const searchQuery = searchQueryRes.value;

      const data = await DustAPI.searchDataSource(
        dataSource.dustAPIProjectId,
        dataSource.name,
        {
          query: searchQuery.query,
          topK: searchQuery.top_k,
          fullText: searchQuery.full_text,
          filter: {
            tags: {
              in: searchQuery.tags_in,
              not: searchQuery.tags_not,
            },
            timestamp: {
              gt: searchQuery.timestamp_gt,
              lt: searchQuery.timestamp_lt,
            },
          },
          credentials: credentials,
        }
      );

      if (data.isErr()) {
        res.status(400).end();
        return;
      }

      res.status(200).json({
        documents: data.value.documents,
      });
      return;
    }

    default:
      res.status(405).end();
      break;
  }
}
