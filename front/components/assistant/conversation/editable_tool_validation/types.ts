import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { AgentLoopBlockedToolExecution } from "@app/lib/actions/mcp";

export type ValidationRequiredToolExecution = Extract<
  AgentLoopBlockedToolExecution,
  { status: "blocked_validation_required" }
>;

export interface EditableToolValidationComponentProps {
  blockedAction: ValidationRequiredToolExecution;
  isSubmitting: boolean;
  isPulsing: boolean;
  alwaysAllowLabel: string | null;
  onApproveWithEditedArguments: (input: {
    editedArguments: Record<string, unknown>;
    approved: MCPValidationOutputType;
  }) => Promise<void>;
}
