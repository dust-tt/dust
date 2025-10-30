import type { estypes } from "@elastic/elasticsearch";

import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { ANALYTICS_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { LightWorkspaceType } from "@app/types";
import type { AgentMessageAnalyticsFeedback } from "@app/types/assistant/analytics";
import type { Result } from "@app/types/shared/result";

function makeDocumentId(
  workspace: LightWorkspaceType,
  messageSId: string,
  createdTimestamp: number
): string {
  const timestamp = new Date(createdTimestamp).toISOString();
  return `${workspace.sId}_${messageSId}_${timestamp}`;
}

export async function updateAnalyticsFeedback(
  auth: Authenticator,
  params: {
    message: {
      sId: string;
    };
    // TODO(observability 21025-10-29): Remove once we use agentMessage.create timestamp to index documents
    createdTimestamp: number;
    feedbacks: AgentMessageAnalyticsFeedback[];
  }
): Promise<Result<estypes.UpdateResponse, ElasticsearchError>> {
  const workspace = auth.getNonNullableWorkspace();
  const { message, feedbacks, createdTimestamp } = params;
  const documentId = makeDocumentId(workspace, message.sId, createdTimestamp);

  return withEs(async (client) => {
    return client.update({
      index: ANALYTICS_ALIAS_NAME,
      id: documentId,
      doc: { feedbacks },
    });
  });
}
