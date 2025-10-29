import type { estypes } from "@elastic/elasticsearch";

import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { ANALYTICS_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMessageType, LightWorkspaceType } from "@app/types";
import type { AgentMessageAnalyticsFeedback } from "@app/types/assistant/analytics";
import type { Result } from "@app/types/shared/result";

function makeDocumentId(
  workspace: LightWorkspaceType,
  message: Pick<AgentMessageType, "sId" | "created">
): string {
  const timestamp = new Date(message.created).toISOString();
  return `${workspace.sId}_${message.sId}_${timestamp}`;
}

export async function updateAnalyticsFeedback(
  auth: Authenticator,
  params: {
    message: Pick<AgentMessageType, "sId" | "created">;
    feedbacks: AgentMessageAnalyticsFeedback[];
  }
): Promise<Result<estypes.UpdateResponse, ElasticsearchError>> {
  const workspace = auth.getNonNullableWorkspace();
  const { message, feedbacks } = params;
  const documentId = makeDocumentId(workspace, message);

  return withEs(async (client) => {
    return client.update({
      index: ANALYTICS_ALIAS_NAME,
      id: documentId,
      doc: { feedbacks },
    });
  });
}
