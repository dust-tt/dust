import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";

export type ValidationRequiredToolExecution = Extract<
  BlockedToolExecution,
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
