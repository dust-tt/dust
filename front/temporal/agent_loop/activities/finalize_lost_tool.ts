import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { updateResourceAndPublishEvent } from "@app/temporal/agent_loop/activities/common";
import { sliceConversationForAgentMessage } from "@app/temporal/agent_loop/lib/loop_utils";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";
import {
  getFullAgentLoopDataWithAuth,
  isAgentLoopDataSoftDeleteError,
} from "@app/types/assistant/agent_run";
import type { ModelId } from "@app/types/shared/model_id";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import assert from "assert";

const LOST_TOOL_ERROR_CONTENT: CallToolResult["content"] = [
  {
    type: "text",
    text:
      "The tool execution was interrupted by an internal error before it returned a result. " +
      "It may or may not have taken effect.",
  },
];

/**
 * @cc [owner:philipperolet,label:product] lost-tool-as-tool-error
 * When the action is not in a final status, it MUST be marked `errored` with an output telling
 * the model the tool's result is unknown, and an `agent_action_success` event MUST be emitted for
 * it through `updateResourceAndPublishEvent`, as for a tool that returned an error. An action
 * already in a final status MUST be left unchanged.
 */
export async function finalizeLostToolActivity(
  authType: AuthenticatorType,
  {
    actionId,
    runAgentArgs,
    step,
  }: {
    actionId: ModelId;
    runAgentArgs: AgentLoopArgsWithTiming;
    step: number;
  }
): Promise<void> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);
  const [runAgentDataRes, action] = await Promise.all([
    getFullAgentLoopDataWithAuth(auth, runAgentArgs),
    AgentMCPActionResource.fetchByModelIdWithAuth(auth, actionId),
  ]);
  if (runAgentDataRes.isErr()) {
    if (isAgentLoopDataSoftDeleteError(runAgentDataRes.error)) {
      return;
    }
    throw runAgentDataRes.error;
  }
  assert(action, "Action not found");

  // The tool may have completed before its worker was lost.
  if (isToolExecutionStatusFinal(action.status)) {
    return;
  }

  const outputRes = await action.createOutputItems(
    auth,
    LOST_TOOL_ERROR_CONTENT.map((content) => ({ content }))
  );
  if (outputRes.isErr()) {
    throw outputRes.error;
  }
  await action.markAsErrored({
    executionDurationMs: Date.now() - action.createdAt.getTime(),
  });

  const { agentConfiguration, conversation, agentMessage } =
    runAgentDataRes.value;
  const { slicedConversation, slicedAgentMessage } =
    sliceConversationForAgentMessage(conversation, {
      agentMessageId: agentMessage.sId,
      agentMessageVersion: agentMessage.version,
      step: step + 1,
    });

  await updateResourceAndPublishEvent(auth, {
    event: {
      type: "agent_action_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: {
        ...action.toJSON(),
        output: LOST_TOOL_ERROR_CONTENT,
        generatedFiles: [],
      },
    },
    agentMessage: slicedAgentMessage,
    conversation: slicedConversation,
    step,
  });
}
