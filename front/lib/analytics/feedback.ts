import type { estypes } from "@elastic/elasticsearch";

import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { ANALYTICS_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { AgentMessageAnalyticsFeedback } from "@app/types/assistant/analytics";
import type { Result } from "@app/types/shared/result";

export async function updateAnalyticsFeedback(
  { documentId }: { documentId: string },
  feedbacks: AgentMessageAnalyticsFeedback[]
): Promise<Result<estypes.UpdateResponse, ElasticsearchError>> {
  return withEs(async (client) => {
    return client.update({
      index: ANALYTICS_ALIAS_NAME,
      id: documentId,
      doc: { feedbacks },
    });
  });
}
