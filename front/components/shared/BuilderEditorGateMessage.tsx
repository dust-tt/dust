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

function getEditorTitle(builderType: BuilderType): string {
  switch (builderType) {
    case "agent":
      return "an agent editor";
    case "skill":
      return "a skill editor";
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
  const editorTitle = getEditorTitle(builderType);

  return (
    <ContentMessage
      title={`Add yourself as ${editorTitle}`}
      variant="warning"
      icon={InfoCircle}
      size="lg"
      action={
        <ContentMessageAction
          icon={UsersPlus}
          label={isLoading ? "Adding..." : "Add me"}
          variant="warning"
          disabled={disabled || isLoading}
          onClick={onAddSelfAsEditor}
        />
      }
    >
      You can view this {builderLabel} as a workspace admin, but you need to add
      yourself as an editor before making changes.
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
