import type { CreditCheckResult } from "@app/lib/api/assistant/credit_check";
import {
  checkPoolCreditGate,
  isCreditSpendCheckpointExempt,
} from "@app/lib/api/assistant/credit_check";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";

export async function checkCreditsActivity(
  authType: AuthenticatorType,
  { agentLoopArgs }: { agentLoopArgs: AgentLoopArgsWithTiming }
): Promise<CreditCheckResult> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  return checkPoolCreditGate(auth, {
    userMessageOrigin: agentLoopArgs.userMessageOrigin ?? null,
  });
}

export type CreditSpendCheckpointActivityResult = { crossed: boolean };

const NOT_CROSSED: CreditSpendCheckpointActivityResult = { crossed: false };

/**
 * @cc [owner:avervaet,label:product] checkpoint-acknowledged-skips
 * When the message's checkpoint status is `acknowledged`, the activity MUST return not crossed,
 * whatever the spend. A user who chose to continue is never asked again for the same message.
 */
/**
 * @cc [owner:avervaet,label:product] checkpoint-root-messages-only
 * When the triggering user message is agentic (the agent message belongs to a sub-agent), the
 * activity MUST return not crossed, whatever the spend. Only the root message can pause: a paused
 * sub-agent would hang its parent's tool call with no one able to acknowledge it.
 */
export async function checkCreditSpendCheckpointActivity(
  authType: AuthenticatorType,
  { agentLoopArgs }: { agentLoopArgs: AgentLoopArgsWithTiming }
): Promise<CreditSpendCheckpointActivityResult> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  if (
    isCreditSpendCheckpointExempt(auth, {
      userMessageOrigin: agentLoopArgs.userMessageOrigin ?? null,
    })
  ) {
    return NOT_CROSSED;
  }

  const context =
    await ConversationResource.fetchCreditSpendCheckpointContextForAgentMessage(
      auth,
      {
        agentMessageId: agentLoopArgs.agentMessageId,
        userMessageId: agentLoopArgs.userMessageId,
      }
    );
  // A missing message cannot be paused: nothing to check.
  if (
    !context ||
    !context.isRootAgentMessage ||
    context.status === "acknowledged"
  ) {
    return NOT_CROSSED;
  }

  return { crossed: true };
}
