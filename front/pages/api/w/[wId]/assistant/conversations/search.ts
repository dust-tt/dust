import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { default as config } from "@app/lib/api/config";
import { fetchProjectDataSourceView } from "@app/lib/api/projects";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type {
  ConversationWithoutContentType,
  WithAPIErrorResponse,
} from "@app/types";
import { CoreAPI, dustManagedCredentials } from "@app/types";

export type SearchConversationsResponseBody = {
  conversations: Array<ConversationWithoutContentType & { spaceName: string }>;
};

const SearchQuerySchema = z.object({
  query: z.string().min(1, "Query is required"),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SearchConversationsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const queryValidation = SearchQuerySchema.safeParse(req.query);
  if (!queryValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${fromError(queryValidation.error).toString()}`,
      },
    });
  }

  const { query, limit } = queryValidation.data;

  const spaces = await SpaceResource.listWorkspaceSpaces(auth, {
    includeProjectSpaces: true,
  });
  const projectSpaces = spaces.filter((s) => s.kind === "project");

  if (projectSpaces.length === 0) {
    return res.status(200).json({ conversations: [] });
  }

  const spaceIdToName = new Map<string, string>();
  for (const space of projectSpaces) {
    spaceIdToName.set(space.sId, space.name);
  }

  const projectDataSourceViews = await concurrentExecutor(
    projectSpaces,
    async (space) => {
      const result = await fetchProjectDataSourceView(auth, space);
      if (result.isErr()) {
        return null;
      }
      return { space, dataSourceView: result.value };
    },
    { concurrency: 10 }
  );

  const validProjects = projectDataSourceViews.filter(
    (p): p is NonNullable<typeof p> => p !== null
  );

  if (validProjects.length === 0) {
    return res.status(200).json({ conversations: [] });
  }

  const searches = validProjects.map(({ dataSourceView }) => ({
    projectId: dataSourceView.dataSource.dustAPIProjectId,
    dataSourceId: dataSourceView.dataSource.dustAPIDataSourceId,
    view_filter: dataSourceView.toViewFilter(),
  }));

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const searchResult = await coreAPI.bulkSearchDataSources(
    query,
    limit * 2,
    dustManagedCredentials(),
    false,
    searches
  );

  if (searchResult.isErr()) {
    logger.error(
      {
        error: searchResult.error,
        workspaceId: auth.getNonNullableWorkspace().sId,
        query,
      },
      "Failed to bulk search conversations"
    );
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to search conversations.",
      },
    });
  }

  const dataSourceIdToSpace = new Map<string, SpaceResource>();
  for (const { space, dataSourceView } of validProjects) {
    dataSourceIdToSpace.set(
      dataSourceView.dataSource.dustAPIDataSourceId,
      space
    );
  }

  const conversationScores = new Map<
    string,
    { score: number; spaceId: string }
  >();
  for (const doc of searchResult.value.documents) {
    const space = dataSourceIdToSpace.get(doc.data_source_id);
    if (!space) {
      continue;
    }

    const conversationTag = doc.tags.find((tag) =>
      tag.startsWith("conversation:")
    );
    if (!conversationTag) {
      continue;
    }

    const conversationId = conversationTag.replace("conversation:", "");
    const maxChunkScore = Math.max(
      ...doc.chunks.map((chunk) => chunk.score ?? 0),
      0
    );

    const existing = conversationScores.get(conversationId);
    if (!existing || maxChunkScore > existing.score) {
      conversationScores.set(conversationId, {
        score: maxChunkScore,
        spaceId: space.sId,
      });
    }
  }

  const results: Array<{
    conv: ConversationWithoutContentType & { spaceName: string };
    score: number;
  }> = [];

  await concurrentExecutor(
    Array.from(conversationScores.entries()),
    async ([conversationId, { score, spaceId }]) => {
      const conv = await ConversationResource.fetchById(auth, conversationId);
      if (conv) {
        results.push({
          conv: {
            ...conv.toJSON(),
            spaceName: spaceIdToName.get(spaceId) ?? "Unknown",
          },
          score,
        });
      }
    },
    { concurrency: 10 }
  );

  results.sort((a, b) => b.score - a.score);

  return res.status(200).json({
    conversations: results.slice(0, limit).map((r) => r.conv),
  });
}

export default withSessionAuthenticationForWorkspace(handler);
