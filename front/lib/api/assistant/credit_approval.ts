import type { Authenticator } from "@app/lib/auth";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import { Op } from "sequelize";

/**
 * Above this many credits consumed by a single agent message (recursively, sub-conversations
 * included), the agent loop stops and asks the user whether to continue.
 * TODO: make this a workspace-level setting, and/or a per-message override.
 */
export const AGENT_MESSAGE_CREDIT_APPROVAL_THRESHOLD = 1_000;

/**
 * Error code carried by the `agent_error` event that stops the loop on the credit threshold. It is
 * also the durable "we already asked" latch: `processEventForDatabase` writes every `agent_error`
 * as an `error` step content, and step contents are never deleted — so a message that has ever
 * asked keeps that row forever, even after the error columns are cleared on resume.
 */
export const CREDIT_APPROVAL_REQUIRED_ERROR_CODE = "credit_approval_required";

export const CREDIT_APPROVAL_REQUIRED_ERROR_TITLE =
  "This message is using a lot of credits";

export function creditApprovalRequiredMessage(costCredits: number): string {
  return `This message has consumed ${costCredits} credits and has not yet finished, do you want to continue?`;
}

export interface CreditApprovalContext {
  agentMessageModelId: ModelId;
  isRootAgentMessage: boolean;
}

/**
 * Whether this run belongs to a root message or to a sub-agent, plus the model id the rest of the
 * gate keys off.
 *
 * Read fresh from the rows (never from the possibly-cached conversation) since it gates whether we
 * interrupt the loop.
 */
export async function fetchCreditApprovalContext(
  auth: Authenticator,
  {
    agentMessageId,
    userMessageId,
  }: {
    agentMessageId: string;
    userMessageId: string;
  }
): Promise<CreditApprovalContext | null> {
  const workspaceId = auth.getNonNullableWorkspace().id;

  const messages = await MessageModel.findAll({
    attributes: ["sId"],
    where: {
      sId: { [Op.in]: [agentMessageId, userMessageId] },
      workspaceId,
    },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        attributes: ["id"],
        required: false,
      },
      {
        model: UserMessageModel,
        as: "userMessage",
        attributes: ["agenticOriginMessageId"],
        required: false,
      },
    ],
  });

  const agentMessage = messages.find(
    (m) => m.sId === agentMessageId
  )?.agentMessage;
  if (!agentMessage) {
    return null;
  }

  const userMessage = messages.find(
    (m) => m.sId === userMessageId
  )?.userMessage;

  return {
    agentMessageModelId: agentMessage.id,
    // A user message with an agentic origin was posted by another agent (run_agent / handover), so
    // this run is a descendant, not the message the user is waiting on.
    isRootAgentMessage: !userMessage?.agenticOriginMessageId,
  };
}

/**
 * Returns the step number of the first `error` step content that has the credit approval error code.
 * Useful to know if approval has already been asked for this message, and if so, at which step.
 * The step number is used to resume the message from that step.
 */
export async function fetchCreditApprovalStep(
  auth: Authenticator,
  { agentMessageModelId }: { agentMessageModelId: ModelId }
): Promise<number | null> {
  const errorContents = await AgentStepContentModel.findAll({
    attributes: ["step", "value"],
    where: {
      agentMessageId: agentMessageModelId,
      workspaceId: auth.getNonNullableWorkspace().id,
      type: "error",
    },
  });

  const steps = errorContents
    .filter(({ value }) => {
      return (
        value.type === "error" &&
        value.value.code === CREDIT_APPROVAL_REQUIRED_ERROR_CODE
      );
    })
    .map((content) => content.step);

  return steps.length > 0 ? Math.max(...steps) : null;
}
