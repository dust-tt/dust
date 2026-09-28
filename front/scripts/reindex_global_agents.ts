import { reindexGlobalAgents } from "@app/lib/agent_search/index_global";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  if (!execute) {
    return;
  }

  const result = await reindexGlobalAgents();
  if (result.isErr()) {
    throw result.error;
  }

  logger.info(result.value, "Global agent search index updated");
});
