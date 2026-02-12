import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { ANALYTICS_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { AgentMessageAnalyticsFeedback } from "@app/types/assistant/analytics";
import type { Result } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function updateAnalyticsFeedback(
  { documentId }: { documentId: string },
  feedbacks: AgentMessageAnalyticsFeedback[]
): Promise<Result<estypes.UpdateResponse, ElasticsearchError>> {
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  return withEs(async (client) => {
    return client.update({
      index: ANALYTICS_ALIAS_NAME,
      id: documentId,
      doc: { feedbacks },
    });
  });
}
