import { GmailSendMailValidation } from "@app/components/assistant/conversation/editable_tool_validation/gmail/tools/GmailSendMailValidation";
import type { EditableToolValidationComponentProps } from "@app/components/assistant/conversation/editable_tool_validation/types";
import { isInternalMCPToolName } from "@app/lib/actions/mcp_internal_actions/constants";

export function GmailEditableToolValidation(
  props: EditableToolValidationComponentProps
) {
  const { toolName } = props.blockedAction.metadata;

  if (!isInternalMCPToolName("gmail", toolName)) {
    return null;
  }

  // toolName is now narrowed to InternalMCPToolNameType<"gmail">.
  switch (toolName) {
    case "send_mail":
      return (
        <GmailSendMailValidation
          key={props.blockedAction.actionId}
          {...props}
        />
      );

    default:
      return null;
  }
}
