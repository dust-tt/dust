import { makeAgentDocumentId } from "@app/lib/agent_search";
import { GLOBAL_AGENTS_WORKSPACE_ID } from "@app/lib/agent_search/constants";
import { getGlobalAgentMetadata } from "@app/lib/api/assistant/global_agents/global_agent_metadata";
import { listDefaultGlobalAgentIds } from "@app/lib/api/assistant/global_agents/global_agents";
import {
  AGENT_SEARCH_ALIAS_NAME,
  ElasticsearchError,
  withEs,
} from "@app/lib/api/elasticsearch";
import logger from "@app/logger/logger";
import type { AgentSearchDocument } from "@app/types/agent_search/agent_search";
import type { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * @cc [owner:sfriquet,label:backend] global-agent-search-projection
 * Global agent documents MUST be built from the static catalog only (`getGlobalAgentMetadata`),
 * never from an `Authenticator`: `model` is null and every workspace- or caller-dependent field
 * (skills, tools, tags, editors, spaces, feedback, usage, dates) is empty, zero or null.
 */
function toAgentSearchDocument(sId: GLOBAL_AGENTS_SID): AgentSearchDocument {
  const { name, description, pictureUrl } = getGlobalAgentMetadata(sId);
  return {
    workspace_id: GLOBAL_AGENTS_WORKSPACE_ID,
    agent_id: sId,
    status: "active",
    scope: "global",
    // Global agents resolve their model and skills per caller.
    model: null,
    name,
    description,
    picture_url: pictureUrl,
    last_edited_by_user_id: null,
    editor_ids: [],
    requested_space_ids: [],
    skill_ids: [],
    mcp_server_view_ids: [],
    tag_ids: [],
    feedback_positive_count: 0,
    feedback_negative_count: 0,
    active_users_count: null,
    favorite_count: 0,
    created_at: null,
    updated_at: null,
  };
}

/**
 * @cc [owner:sfriquet,label:security] global-agent-index-reconciliation
 * Write only in the global agents namespace. Delete obsolete documents only after every default
 * global agent (see `default-global-agent-ids`) has been indexed successfully.
 */
export async function reindexGlobalAgents(): Promise<
  Result<{ indexed: number; deleted: number }, ElasticsearchError>
> {
  const documents = listDefaultGlobalAgentIds().map(toAgentSearchDocument);
  const agentIds = documents.map((document) => document.agent_id);

  if (documents.length > 0) {
    const result = await withEs((client) =>
      client.bulk({
        require_alias: true,
        operations: documents.flatMap((document) => [
          {
            index: {
              _index: AGENT_SEARCH_ALIAS_NAME,
              _id: makeAgentDocumentId({
                workspaceId: document.workspace_id,
                agentId: document.agent_id,
              }),
            },
          },
          document,
        ]),
      })
    );
    if (result.isErr()) {
      return result;
    }
    if (result.value.errors) {
      logger.error(
        {
          errors: result.value.items.filter((item) => item.index?.error),
        },
        "Failed to index global agents."
      );
      return new Err(
        new ElasticsearchError(
          "query_error",
          "Failed to index global agents; obsolete documents were not deleted."
        )
      );
    }
  }

  const deleted = await withEs((client) =>
    client.deleteByQuery({
      index: AGENT_SEARCH_ALIAS_NAME,
      query: {
        bool: {
          filter: [{ term: { workspace_id: GLOBAL_AGENTS_WORKSPACE_ID } }],
          must_not: [{ terms: { agent_id: agentIds } }],
        },
      },
    })
  );
  if (deleted.isErr()) {
    return deleted;
  }
  if (deleted.value.timed_out || deleted.value.failures?.length) {
    return new Err(
      new ElasticsearchError(
        "query_error",
        "Failed to remove obsolete global agent documents."
      )
    );
  }

  return new Ok({
    indexed: documents.length,
    deleted: deleted.value.deleted ?? 0,
  });
}
