import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  ContentMessage,
  ContentMessageAction,
  InfoCircle,
  RefreshCw02,
  UsersPlus,
} from "@dust-tt/sparkle";

type BuilderType = "agent" | "skill";

function getBuilderLabel(builderType: BuilderType): string {
  switch (builderType) {
    case "agent":
      return "agent";
    case "skill":
      return "skill";
    default:
      assertNever(builderType);
  }
}

interface BuilderEditorGateMessageProps {
  builderType: BuilderType;
  disabled?: boolean;
  isLoading?: boolean;
  onAddSelfAsEditor: () => void;
}

export function BuilderEditorGateMessage({
  builderType,
  disabled = false,
  isLoading = false,
  onAddSelfAsEditor,
}: BuilderEditorGateMessageProps) {
  const builderLabel = getBuilderLabel(builderType);

  return (
    <ContentMessage
      title={`You are not an editor of this ${builderLabel}`}
      variant="golden"
      icon={InfoCircle}
      size="lg"
      action={
        <ContentMessageAction
          icon={UsersPlus}
          label={isLoading ? "Preparing..." : "Continue editing"}
          variant="warning-secondary"
          disabled={disabled || isLoading}
          onClick={onAddSelfAsEditor}
        />
      }
    >
      You can view this {builderLabel} as a workspace admin. Continuing lets you
      save changes as an editor.
    </ContentMessage>
  );
}

interface BuilderEditorLoadErrorMessageProps {
  builderType: BuilderType;
  disabled?: boolean;
  onRetry: () => void;
}

export function BuilderEditorLoadErrorMessage({
  builderType,
  disabled = false,
  onRetry,
}: BuilderEditorLoadErrorMessageProps) {
  const builderLabel = getBuilderLabel(builderType);

  return (
    <ContentMessage
      title="Unable to verify editor access"
      variant="warning"
      icon={InfoCircle}
      size="lg"
      action={
        <ContentMessageAction
          icon={RefreshCw02}
          label="Retry"
          variant="warning"
          disabled={disabled}
          onClick={onRetry}
        />
      }
    >
      We could not load the {builderLabel} editors. Retry before making changes.
    </ContentMessage>
  );
}
