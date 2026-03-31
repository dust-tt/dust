import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/project_todo/activities";
import { TODO_DEBOUNCE_DELAY_MS } from "@app/temporal/project_todo/config";
import {
  todoCompleteSignal,
  todoRefreshSignal,
} from "@app/temporal/project_todo/signals";
import {
  condition,
  proxyActivities,
  setHandler,
  sleep,
} from "@temporalio/workflow";

const { analyzeProjectTodosActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function projectTodoWorkflow({
  authType,
  conversationId,
  messageId,
}: {
  authType: AuthenticatorType;
  conversationId: string;
  messageId: string;
}): Promise<void> {
  let needsAnalysis = true;
  let complete = false;
  let latestMessageId: string | null = null;

  setHandler(todoRefreshSignal, (msgId: string) => {
    needsAnalysis = true;
    latestMessageId = msgId;
  });

  setHandler(todoCompleteSignal, (msgId: string) => {
    needsAnalysis = true;
    complete = true;
    latestMessageId = msgId;
  });

  while (!complete) {
    await condition(() => needsAnalysis);
    needsAnalysis = false;
    const msgId = latestMessageId;
    await sleep(TODO_DEBOUNCE_DELAY_MS);

    if (needsAnalysis) {
      continue;
    }

    if (msgId) {
      await analyzeProjectTodosActivity({
        authType,
        conversationId,
        messageId: msgId,
      });
    }
  }

  // Final analysis after completion signal.
  if (latestMessageId) {
    await analyzeProjectTodosActivity({
      authType,
      conversationId,
      messageId: latestMessageId,
    });
  }
}
