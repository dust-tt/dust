import { ToolValidationCard } from "@app/components/actions/blocked/ToolValidationCard";
import { useValidateSandboxFunctionAction } from "@app/hooks/useValidateSandboxFunctionAction";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { SandboxFunctionMCPApproveExecutionEvent } from "@app/lib/actions/mcp_internal_actions/events";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useState } from "react";

interface SandboxFunctionToolApprovalCardProps {
  event: SandboxFunctionMCPApproveExecutionEvent;
  onResolved: (actionId: string) => void;
}

export function SandboxFunctionToolApprovalCard({
  event,
  onResolved,
}: SandboxFunctionToolApprovalCardProps) {
  const { user, workspace } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { validateAction, isValidating } = useValidateSandboxFunctionAction({
    owner: workspace,
    onError: setErrorMessage,
  });

  const handleValidation = async (
    approved: MCPValidationOutputType
  ): Promise<boolean> => {
    setErrorMessage(null);

    const result = await validateAction({
      sandboxFunctionId: event.sandboxFunctionId,
      invocationId: event.invocationId,
      actionId: event.actionId,
      approved,
    });

    if (!result.success) {
      return false;
    }

    onResolved(event.actionId);
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
