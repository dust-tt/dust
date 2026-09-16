import { GmailComposeValidation } from "@app/components/assistant/conversation/editable_tool_validation/gmail/tools/GmailComposeValidation";
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
        <GmailComposeValidation
          key={props.blockedAction.actionId}
          isDraft={false}
          {...props}
        />
      );

    case "create_draft":
      return (
        <GmailComposeValidation
          key={props.blockedAction.actionId}
          isDraft
          {...props}
        />
      );

    default:
      return null;
  }
}
