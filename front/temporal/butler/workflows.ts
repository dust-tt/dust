import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/butler/activities";
import { DEBOUNCE_DELAY_MS } from "@app/temporal/butler/config";
import {
  condition,
  proxyActivities,
  setHandler,
  sleep,
} from "@temporalio/workflow";
import { butlerCompleteSignal, butlerRefreshSignal } from "./signals";

const { analyzeConversationActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

export async function butlerWorkflow({
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

  setHandler(butlerRefreshSignal, (messageId: string) => {
    needsAnalysis = true;
    latestMessageId = messageId;
  });

  setHandler(butlerCompleteSignal, (messageId: string) => {
    needsAnalysis = true;
    complete = true;
    latestMessageId = messageId;
  });

  while (!complete) {
    await condition(() => needsAnalysis);
    needsAnalysis = false;
    const messageId = latestMessageId;
    await sleep(DEBOUNCE_DELAY_MS);

    if (needsAnalysis) {
      continue;
    }

    if (messageId) {
      await analyzeConversationActivity({
        conversationId,
        authType,
        messageId,
      });
    }
  }

  // Final analysis after completion signal.
  if (latestMessageId) {
    await analyzeConversationActivity({
      conversationId,
      authType,
      messageId: latestMessageId,
    });
  }
}
