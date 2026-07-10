import { ToolValidationCard } from "@app/components/actions/blocked/ToolValidationCard";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { SandboxFunctionMCPApproveExecutionEvent } from "@app/lib/actions/mcp_internal_actions/events";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useValidateAction } from "@app/lib/swr/tool_actions";
import { useState } from "react";

interface SandboxFunctionToolApprovalCardProps {
  event: SandboxFunctionMCPApproveExecutionEvent;
  onResolved: () => void;
}

export function SandboxFunctionToolApprovalCard({
  event,
  onResolved,
}: SandboxFunctionToolApprovalCardProps) {
  const { user, workspace } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { validateAction, isValidating } = useValidateAction({
    owner: workspace,
    onError: setErrorMessage,
  });

  const handleValidation = async (
    approved: MCPValidationOutputType
  ): Promise<boolean> => {
    setErrorMessage(null);

    const result = await validateAction({
      contextType: "sandbox_function",
      sandboxFunctionId: event.sandboxFunctionId,
      invocationId: event.invocationId,
      actionId: event.actionId,
      approved,
    });

    if (!result.success) {
      return false;
    }

    onResolved();
    return true;
  };

  return (
    <ToolValidationCard
      validationRequest={event}
      triggeringUser={user}
      owner={workspace}
      errorMessage={errorMessage}
      isValidating={isValidating}
      onValidate={handleValidation}
    />
  );
}
