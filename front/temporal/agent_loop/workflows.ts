import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/temporal/agent_loop/activities";

const { planActivity, runToolActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minute",
});

export async function agentLoopWorkflow({
  agentMessageId,
}: {
  agentMessageId: string;
}) {
  let step = 0;

  for (;;) {
    const toolCallsCount = await planActivity({ agentMessageId, step });

    if (!toolCallsCount) {
      return;
    }

    await Promise.all(
      Array.from({ length: toolCallsCount }).map((_, index) =>
        runToolActivity({ agentMessageId, step, index })
      )
    );

    step += 1;
  }
}
