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

  setHandler(butlerRefreshSignal, () => {
    needsAnalysis = true;
  });

  setHandler(butlerCompleteSignal, () => {
    needsAnalysis = true;
    complete = true;
  });

  while (!complete) {
    await condition(() => needsAnalysis);
    needsAnalysis = false;
    await sleep(DEBOUNCE_DELAY_MS);

    if (needsAnalysis) {
      continue;
    }

    await analyzeConversationActivity({ authType, conversationId, messageId });
  }

  // Final analysis after completion signal.
  await analyzeConversationActivity({ authType, conversationId, messageId });
}
