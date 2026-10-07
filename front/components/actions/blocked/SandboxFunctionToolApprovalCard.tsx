import { ToolValidationCard } from "@app/components/actions/blocked/ToolValidationCard";
import type { FrameViewer } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { SandboxFunctionMCPApproveExecutionEvent } from "@app/lib/actions/mcp_internal_actions/events";
import { useValidateAction } from "@app/lib/swr/tool_actions";
import { useState } from "react";

interface SandboxFunctionToolApprovalCardProps {
  event: SandboxFunctionMCPApproveExecutionEvent;
  // Viewer context is passed in: shared frames render this card outside of any AuthProvider.
  viewer: FrameViewer;
  onResolved: () => void;
}

export function SandboxFunctionToolApprovalCard({
  event,
  viewer,
  onResolved,
}: SandboxFunctionToolApprovalCardProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { validateAction, isValidating } = useValidateAction({
    owner: viewer.owner,
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
      // Shared frames render this card outside of any Notification.Area, so the error stays inline.
      setErrorMessage("Failed to assess action approval. Please try again.");
      return false;
    }

    onResolved();
    return true;
  };

  return (
    <ToolValidationCard
      validationRequest={event}
      triggeringUser={viewer.user}
      currentUser={viewer.user}
      owner={viewer.owner}
      errorMessage={errorMessage}
      isValidating={isValidating}
      onValidate={handleValidation}
    />
  );
}
