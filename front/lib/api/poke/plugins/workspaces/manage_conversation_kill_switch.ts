import { createPlugin } from "@app/lib/api/poke/types";
import {
  WORKSPACE_CONVERSATION_KILL_SWITCH_OPERATIONS,
  type WorkspaceConversationKillSwitchOperation,
} from "@app/lib/api/workspace";
import { updateWorkspaceConversationKillSwitch } from "@app/lib/api/workspace_kill_switch";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

function isWorkspaceConversationKillSwitchOperation(
  operation: string
): operation is WorkspaceConversationKillSwitchOperation {
  return WORKSPACE_CONVERSATION_KILL_SWITCH_OPERATIONS.some(
    (allowedOperation) => allowedOperation === operation
  );
}

export const manageConversationKillSwitchPlugin = createPlugin({
  manifest: {
    id: "manage-conversation-kill-switch",
    name: "Manage Conversation Kill Switch",
    description:
      "Block or unblock access to a workspace conversation for emergency maintenance.",
    resourceTypes: ["workspaces"],
    args: {
      conversationId: {
        type: "string",
        label: "Conversation ID",
        description: "The sId of the conversation to block or unblock",
        required: true,
      },
      operation: {
        type: "enum",
        label: "Operation",
        description: "Select whether to block or unblock the conversation",
        values: mapToEnumValues(
          WORKSPACE_CONVERSATION_KILL_SWITCH_OPERATIONS,
          (operation) => ({
            label: operation,
            value: operation,
          })
        ),
        multiple: false,
      },
    },
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const conversationId = args.conversationId.trim();
    if (!conversationId) {
      return new Err(new Error("conversationId is required"));
    }

    const operationArg = args.operation[0];
    if (!operationArg) {
      return new Err(new Error("Please select an operation."));
    }
    if (!isWorkspaceConversationKillSwitchOperation(operationArg)) {
      return new Err(new Error(`Invalid operation: ${operationArg}`));
    }

    const updateResult = await updateWorkspaceConversationKillSwitch(
      auth,
      workspace,
      {
        conversationId,
        operation: operationArg,
      }
    );
    if (updateResult.isErr()) {
      return new Err(updateResult.error);
    }

    const { wasBlockedBefore } = updateResult.value;

    switch (operationArg) {
      case "block":
        return new Ok({
          display: "text",
          value: wasBlockedBefore
            ? `Conversation ${conversationId} was already blocked for workspace "${workspace.name}".`
            : `Conversation ${conversationId} is now blocked for workspace "${workspace.name}".`,
        });
      case "unblock":
        return new Ok({
          display: "text",
          value: wasBlockedBefore
            ? `Conversation ${conversationId} is now unblocked for workspace "${workspace.name}".`
            : `Conversation ${conversationId} was not blocked for workspace "${workspace.name}".`,
        });
      default:
        return assertNever(operationArg);
    }
  },
});
