import { JSONSchemaType } from "ajv";
import { NextApiRequest, NextApiResponse } from "next";

import {
  credentialsFromProviders,
  dustManagedCredentials,
} from "@app/lib/api/credentials";
import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { CoreAPI } from "@app/lib/core_api";
import { parse_payload } from "@app/lib/http_utils";
import { Provider } from "@app/lib/models";
import { DocumentType } from "@app/types/document";
import { CredentialsType } from "@app/types/provider";

export type DatasourceSearchQuery = {
  query: string;
  top_k: number;
  full_text: boolean;
  target_document_tokens?: number;
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
    target_document_tokens: { type: "number", nullable: true },
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

      let credentials: CredentialsType | null = null;
      if (dataSource.connectorId) {
        // Dust managed credentials: managed data source.
        credentials = dustManagedCredentials();
      } else {
        const providers = await Provider.findAll({
          where: {
            workspaceId: owner.id,
          },
        });
        credentials = credentialsFromProviders(providers);
      }
      const searchQueryRes = parse_payload(searchQuerySchema, requestPayload);

      if (searchQueryRes.isErr()) {
        res.status(400).end();
        return;
      }
      const searchQuery = searchQueryRes.value;

      const data = await CoreAPI.searchDataSource(
        dataSource.dustAPIProjectId,
        dataSource.name,
        {
          query: searchQuery.query,
          topK: searchQuery.top_k,
          fullText: searchQuery.full_text,
          target_document_tokens: searchQuery.target_document_tokens,
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
