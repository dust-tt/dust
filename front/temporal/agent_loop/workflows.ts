import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/agent_loop/activities";

const { planActivity, runToolActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minute",
});

export async function agentLoopWorkflow({
  agentMessageId,
  conversationId,
}: {
  agentMessageId: number;
  conversationId: string;
}) {
  let step = 0;

  for (;;) {
    const { maxStepsExhausted, toolCallsCount } = await planActivity({
      agentMessageId,
      conversationId,
      step,
    });

    if (maxStepsExhausted || toolCallsCount === 0) {
      return;
    }

    await Promise.all(
      Array.from({ length: toolCallsCount }).map((_, index) =>
        runToolActivity({ agentMessageId, conversationId, step, index })
      )
    );

    step += 1;
  }
}
