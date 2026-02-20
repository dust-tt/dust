import { createPlugin } from "@app/lib/api/poke/types";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

const WORKSPACE_CONVERSATION_KILL_SWITCH_OPERATIONS = [
  "block",
  "unblock",
] as const;
type WorkspaceConversationKillSwitchOperation =
  (typeof WORKSPACE_CONVERSATION_KILL_SWITCH_OPERATIONS)[number];

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

    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (!workspaceResource) {
      return new Err(new Error(`Workspace not found: wId='${workspace.sId}'`));
    }

    if (operationArg === "block") {
      const conversation = await ConversationResource.fetchById(
        auth,
        conversationId
      );
      if (!conversation) {
        return new Err(
          new Error(`Conversation not found: cId='${conversationId}'`)
        );
      }
    }

    const updateResult = await workspaceResource.updateConversationKillSwitch({
      conversationId,
      operation: operationArg,
    });
    if (updateResult.isErr()) {
      return new Err(updateResult.error);
    }
    const { wasUpdated } = updateResult.value;

    switch (operationArg) {
      case "block":
        return new Ok({
          display: "text",
          value: wasUpdated
            ? `Conversation ${conversationId} is now blocked for workspace "${workspace.name}".`
            : `Conversation ${conversationId} was already blocked for workspace "${workspace.name}".`,
        });
      case "unblock":
        return new Ok({
          display: "text",
          value: wasUpdated
            ? `Conversation ${conversationId} is now unblocked for workspace "${workspace.name}".`
            : `Conversation ${conversationId} was not blocked for workspace "${workspace.name}".`,
        });
      default:
        return assertNever(operationArg);
    }
  },
});
