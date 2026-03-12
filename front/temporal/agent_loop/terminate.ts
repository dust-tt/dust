import { getTemporalClientForAgentNamespace } from "@app/lib/temporal";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { WorkflowNotFoundError } from "@temporalio/client";

export async function terminateAllAgentLoopWorkflowsForConversation(
  conversationId: string
) {
  const client = await getTemporalClientForAgentNamespace();

  const workflowInfos = client.workflow.list({
    query: `ExecutionStatus = 'Running' AND conversationId = '${conversationId}'`,
  });

  logger.info(
    { conversationId },
    "About to terminate all agent loop workflows for conversation"
  );

  const workflows = [];
  for await (const info of workflowInfos) {
    workflows.push(info);
  }

  await concurrentExecutor(
    workflows,
    async (info) => {
      logger.info(
        { conversationId, workflowId: info.workflowId },
        "Terminating agent loop workflow"
      );

      const handle = client.workflow.getHandle(info.workflowId);
      try {
        await handle.terminate("Conversation blocked via kill switch");
      } catch (err) {
        if (err instanceof WorkflowNotFoundError) {
          return;
        }
        throw err;
      }
    },
    { concurrency: 8 }
  );
}
