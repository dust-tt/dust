import type { estypes } from "@elastic/elasticsearch";

import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { ANALYTICS_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { WorkspaceType } from "@app/types";
import type { AgentMessageAnalyticsFeedback } from "@app/types/assistant/analytics";
import type { AgentMessageType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";

function constructDocumentId(
  workspace: WorkspaceType,
  message: AgentMessageType
): string {
  const timestamp = new Date(message.created).toISOString();
  return `${workspace.sId}_${message.sId}_${timestamp}`;
}

/**
 * Updates the feedbacks array for an analytics document.
 */
export async function updateAnalyticsFeedback({
  auth,
  message,
  feedbacks,
}: {
  auth: Authenticator;
  message: AgentMessageType;
  feedbacks: AgentMessageAnalyticsFeedback[];
}): Promise<Result<estypes.UpdateResponse, ElasticsearchError>> {
  const workspace = auth.getNonNullableWorkspace();
  const documentId = constructDocumentId(workspace, message);

  return withEs(async (client) => {
    return client.update({
      index: ANALYTICS_ALIAS_NAME,
      id: documentId,
      doc: { feedbacks },
    });
  });
}
