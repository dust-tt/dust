import { ToolValidationCardContainer } from "@app/components/actions/blocked/ToolValidationCardContainer";
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
    onError: setErrorMessage,
    frameShareToken: viewer.frameShareToken,
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
    <ToolValidationCardContainer
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
