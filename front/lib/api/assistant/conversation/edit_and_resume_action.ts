import { isMCPApproveExecutionEvent } from "@app/lib/actions/mcp";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { getConversationRankVersionLock } from "@app/lib/api/assistant/conversation/lock";
import { getUserMessageIdFromMessageId } from "@app/lib/api/assistant/conversation/messages";
import { getMessageChannelId } from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export async function editAndResumeAction(
  auth: Authenticator,
  conversation: ConversationResource,
  {
    actionId,
    messageId,
    editedInputs,
  }: {
    actionId: string;
    messageId: string;
    editedInputs: Record<string, unknown>;
  }
): Promise<Result<void, DustError>> {
  const user = auth.user();
  const owner = auth.getNonNullableWorkspace();
  const { sId: conversationId, title: conversationTitle } = conversation;

  const {
    userMessageId,
    userMessageVersion,
    userMessageUserId,
    userMessageOrigin,
    branchId,
  } = await getUserMessageIdFromMessageId(auth, { messageId });

  if (
    !canCurrentUserRespondToParentUserMessage({
      parentUserId: userMessageUserId,
      currentUserId: user?.id,
    })
  ) {
    return new Err(
      new DustError(
        "unauthorized",
        "User is not authorized to edit this action"
      )
    );
  }

  const action = await AgentMCPActionResource.fetchById(auth, actionId);
  if (!action) {
    return new Err(
      new DustError("action_not_found", `Action not found: ${actionId}`)
    );
  }

  if (action.status !== "blocked_validation_required") {
    return new Err(
      new DustError(
        "action_not_blocked",
        `Action is not blocked: ${action.status}`
      )
    );
  }

  if (action.toolConfiguration.permission !== "editable") {
    return new Err(
      new DustError(
        "tool_not_editable",
        `Tool does not have editable stake: ${action.toolConfiguration.permission}`
      )
    );
  }

  // Restrict edited inputs to declared editableArguments
  const editableArguments = action.toolConfiguration.editableArguments;
  const restrictedInputs: Record<string, unknown> = {};
  if (editableArguments) {
    for (const key of Object.keys(editedInputs)) {
      if (!editableArguments.includes(key)) {
        return new Err(
          new DustError(
            "invalid_edited_inputs",
            `Key "${key}" is not in editableArguments for this tool`
          )
        );
      }
      restrictedInputs[key] = editedInputs[key];
    }
  } else {
    Object.assign(restrictedInputs, editedInputs);
  }

  const blockedStep = action.stepContent.step;
  const blockedIndex = action.stepContent.index;

  // Fetch the MessageModel for the current agent message to get rank/version/parentId
  const agentMessageModelId = action.agentMessageId;
  const messageRow = await MessageModel.findOne({
    where: {
      workspaceId: owner.id,
      conversationId: conversation.id,
      agentMessageId: agentMessageModelId,
    },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
      },
    ],
  });

  if (!messageRow?.agentMessage || !messageRow.parentId) {
    return new Err(
      new DustError(
        "action_not_found",
        "Could not find the agent message for this action"
      )
    );
  }

  // Fetch step-k function_call step contents and the actions linked to them
  const allStepContentsForMessage =
    await AgentStepContentResource.fetchByAgentMessages(auth, {
      agentMessageIds: [agentMessageModelId],
      latestVersionsOnly: true,
    });
  const stepKContents = allStepContentsForMessage.filter(
    (c) => c.step === blockedStep && c.type === "function_call"
  );
  const stepKActions = await AgentMCPActionResource.fetchByStepContents(auth, {
    stepContents: stepKContents,
  });

  // Build the new arguments string by merging edited inputs on top of the original raw inputs
  const originalArguments = action.stepContent.isFunctionCallContent()
    ? (JSON.parse(action.stepContent.value.value.arguments) as Record<
        string,
        unknown
      >)
    : {};
  const newArgumentsString = JSON.stringify({
    ...originalArguments,
    ...restrictedInputs,
  });

  let newMessageSId: string | null = null;
  let newMessageVersion: number | null = null;

  try {
    await withTransaction(async (t) => {
      await getConversationRankVersionLock(
        auth,
        conversation as unknown as ConversationWithoutContentType,
        t
      );

      // Guard against a concurrent fork
      const existingNewer = await MessageModel.findOne({
        where: {
          workspaceId: owner.id,
          rank: messageRow.rank,
          conversationId: conversation.id,
          version: messageRow.version + 1,
        },
        transaction: t,
      });
      if (existingNewer) {
        throw new Error(
          "A newer version of this message already exists; concurrent edit detected"
        );
      }

      // Create new AgentMessageModel + MessageModel for version N+1
      const agentMsg = messageRow.agentMessage!;
      const newAgentMessageRow = await AgentMessageModel.create(
        {
          status: "created",
          agentConfigurationId: agentMsg.agentConfigurationId,
          agentConfigurationVersion: agentMsg.agentConfigurationVersion,
          workspaceId: owner.id,
          skipToolsValidation: agentMsg.skipToolsValidation,
        },
        { transaction: t }
      );

      const newMessageRow = await MessageModel.create(
        {
          sId: generateRandomModelSId(),
          rank: messageRow.rank,
          conversationId: conversation.id,
          branchId: messageRow.branchId,
          parentId: messageRow.parentId,
          version: messageRow.version + 1,
          agentMessageId: newAgentMessageRow.id,
          workspaceId: owner.id,
        },
        { transaction: t }
      );

      newMessageSId = newMessageRow.sId;
      newMessageVersion = newMessageRow.version;

      // Copy step contents 0..blockedStep onto the new agent message,
      // overriding the edited action's function_call arguments
      const newStepContents =
        await AgentStepContentResource.copyForAgentMessage(auth, {
          fromAgentMessageId: agentMessageModelId,
          toAgentMessageId: newAgentMessageRow.id,
          throughStep: blockedStep,
          argumentOverrides: [
            {
              step: blockedStep,
              index: blockedIndex,
              arguments: newArgumentsString,
            },
          ],
          transaction: t,
        });

      // Map new step contents by (step, index) for quick lookup
      const newStepContentMap = new Map(
        newStepContents.map((sc) => [`${sc.step}:${sc.index}`, sc])
      );

      const conversationForMakeNew =
        conversation as unknown as ConversationWithoutContentType;

      // Recreate each step-k action on the new agent message
      for (const originalAction of stepKActions) {
        const key = `${originalAction.stepContent.step}:${originalAction.stepContent.index}`;
        const newStepContent = newStepContentMap.get(key);
        if (!newStepContent) {
          continue;
        }

        const isEditedAction = originalAction.sId === actionId;
        const newAugmentedInputs = isEditedAction
          ? { ...originalAction.augmentedInputs, ...restrictedInputs }
          : originalAction.augmentedInputs;
        // Siblings (other actions at the same step) are auto-approved as-is:
        // the user's "Edit & send" implicitly confirms the whole step.
        const newStatus = "ready_allowed_explicitly" as const;

        await AgentMCPActionResource.makeNew(
          auth,
          { conversation: conversationForMakeNew, stepContent: newStepContent },
          {
            agentMessageId: newAgentMessageRow.id,
            augmentedInputs: newAugmentedInputs,
            citationsAllocated: originalAction.citationsAllocated,
            mcpServerConfigurationId: originalAction.mcpServerConfigurationId,
            status: newStatus,
            stepContext: originalAction.stepContext,
            toolConfiguration: originalAction.toolConfiguration,
          },
          { transaction: t }
        );
      }
    });
  } catch (e) {
    return new Err(
      new DustError(
        "internal_error",
        e instanceof Error ? e.message : "Failed to fork agent message"
      )
    );
  }

  // Defensively mark the original action as denied so it no longer appears blocked
  await action.updateStatus("denied");

  // Remove the tool approval request event from the message channel
  await getRedisHybridManager().removeEvent((event) => {
    const payload = JSON.parse(event.message["payload"]);
    return isMCPApproveExecutionEvent(payload)
      ? payload.actionId === actionId
      : false;
  }, getMessageChannelId(messageId));

  if (!newMessageSId || newMessageVersion === null) {
    return new Err(
      new DustError(
        "internal_error",
        "Failed to create new agent message version"
      )
    );
  }

  // Launch the agent loop on version N+1 starting at the blocked step
  await launchAgentLoopWorkflow({
    auth,
    agentLoopArgs: {
      agentMessageId: newMessageSId,
      agentMessageVersion: newMessageVersion,
      conversationId,
      conversationTitle,
      conversationBranchId: branchId,
      userMessageId,
      userMessageVersion,
      userMessageOrigin,
    },
    startStep: blockedStep,
  });

  return new Ok(undefined);
}
