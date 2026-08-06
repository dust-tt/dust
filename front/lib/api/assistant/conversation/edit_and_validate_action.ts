import type { ActionApprovalStateType } from "@app/lib/actions/mcp";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { validateAction } from "@app/lib/api/assistant/conversation/validate_actions";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import isEqual from "lodash/isEqual";

function getChangedEditedInputs({
  currentInputs,
  editedArguments,
}: {
  currentInputs: Record<string, unknown>;
  editedArguments: Record<string, unknown>;
}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(editedArguments).filter(
      ([key, newValue]) => !isEqual(currentInputs[key], newValue)
    )
  );
}

function getEditableArguments(
  action: AgentMCPActionResource
): Result<readonly string[], DustError<"action_not_editable">> {
  const editableArguments = isLightServerSideMCPToolConfiguration(
    action.toolConfiguration
  )
    ? action.toolConfiguration.editableArguments
    : undefined;

  if (!editableArguments || editableArguments.length === 0) {
    return new Err(
      new DustError("action_not_editable", "Action inputs are not editable.")
    );
  }

  return new Ok(editableArguments);
}

export async function editAndValidateAction(
  auth: Authenticator,
  conversation: ConversationResource,
  {
    actionId,
    approvalState,
    editedArguments,
    messageId,
  }: {
    actionId: string;
    approvalState: ActionApprovalStateType;
    editedArguments: Record<string, unknown>;
    messageId: string;
  }
): Promise<
  Result<
    void,
    DustError<
      | "action_not_found"
      | "action_not_blocked"
      | "action_not_editable"
      | "invalid_edited_arguments"
      | "internal_error"
    >
  >
> {
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

  if (approvalState === "rejected") {
    const validateActionResult = await validateAction(auth, conversation, {
      actionId,
      approvalState,
      messageId,
    });
    if (validateActionResult.isErr()) {
      return new Err(
        new DustError(
          "internal_error",
          `Failed to reject action: ${validateActionResult.error.message}`
        )
      );
    }
    return new Ok(undefined);
  }

  const editableResult = getEditableArguments(action);
  if (editableResult.isErr()) {
    return editableResult;
  }

  const editedKeys = Object.keys(editedArguments);
  const editableArguments = new Set(editableResult.value);
  const disallowedKey = editedKeys.find((key) => !editableArguments.has(key));
  if (!!disallowedKey) {
    return new Err(
      new DustError(
        "invalid_edited_arguments",
        `Edited arguments are not editable: ${disallowedKey}`
      )
    );
  }

  const changedEditedInputs = getChangedEditedInputs({
    currentInputs: action.augmentedInputs,
    editedArguments,
  });
  if (Object.keys(changedEditedInputs).length > 0) {
    await action.updateUserEditedInputs(changedEditedInputs);
  }

  const validateActionResult = await validateAction(auth, conversation, {
    actionId,
    approvalState,
    messageId,
  });
  if (validateActionResult.isErr()) {
    return new Err(
      new DustError(
        "internal_error",
        `Failed to validate action after editing: ${validateActionResult.error.message}`
      )
    );
  }
  return new Ok(undefined);
}
