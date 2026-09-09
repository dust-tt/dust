import { AGENT_SEARCH_ALIAS_NAME } from "@app/lib/api/elasticsearch";
import { ResourceSearchIndex } from "@app/lib/search/resource_search_index";
import type { AgentSearchDocument } from "@app/types/agent_search/agent_search";

export const agentSearchIndex = new ResourceSearchIndex<AgentSearchDocument>(
  AGENT_SEARCH_ALIAS_NAME,
  "agent_id"
);
