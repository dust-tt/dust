import { GmailEditableToolValidation } from "@app/components/assistant/conversation/editable_tool_validation/gmail/GmailEditableToolValidation";
import type { ValidationRequiredToolExecution } from "@app/components/assistant/conversation/editable_tool_validation/types";
import { useEditAndValidateAction } from "@app/hooks/useEditAndValidateAction";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import { isInternalMCPServerName } from "@app/lib/actions/mcp_internal_actions/constants";
import type { LightWorkspaceType } from "@app/types/user";

interface EditableToolValidationProps {
  blockedAction: ValidationRequiredToolExecution;
  alwaysAllowLabel: string | null;
  isPulsing: boolean;
  isValidating: boolean;
  onActionCompleted: () => void;
  onError: (errorMessage: string | null) => void;
  onValidationStart: () => void;
  owner: LightWorkspaceType;
}

export function isEditableToolValidationSupported(
  blockedAction: ValidationRequiredToolExecution
): boolean {
  return !!blockedAction.editable?.isEditable;
}

export function EditableToolValidation({
  blockedAction,
  alwaysAllowLabel,
  isPulsing,
  isValidating,
  onActionCompleted,
  onError,
  onValidationStart,
  owner,
}: EditableToolValidationProps) {
  const { editAndValidateAction, isEditingAndValidating } =
    useEditAndValidateAction({
      owner,
      onError,
    });

  const handleApproveWithEditedArguments = async (input: {
    editedArguments: Record<string, unknown>;
    approved: MCPValidationOutputType;
  }) => {
    onValidationStart();

    const result = await editAndValidateAction({
      validationRequest: blockedAction,
      approvalState: input.approved,
      editedArguments: input.editedArguments,
    });

    if (result.success) {
      onActionCompleted();
    }
  };

  const isSubmitting = isValidating || isEditingAndValidating;

  const { mcpServerName } = blockedAction.metadata;

  if (!isInternalMCPServerName(mcpServerName)) {
    return null;
  }

  switch (mcpServerName) {
    case "gmail":
      return (
        <GmailEditableToolValidation
          blockedAction={blockedAction}
          alwaysAllowLabel={alwaysAllowLabel}
          isSubmitting={isSubmitting}
          isPulsing={isPulsing}
          onApproveWithEditedArguments={handleApproveWithEditedArguments}
        />
      );

    default:
      return null;
  }
}
