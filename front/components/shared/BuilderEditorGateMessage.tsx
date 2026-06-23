import {
  ContentMessage,
  ContentMessageAction,
  InfoCircle,
  UsersPlus,
} from "@dust-tt/sparkle";

interface BuilderEditorGateMessageProps {
  builderType: "agent" | "skill";
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
  const editorTitle =
    builderType === "agent" ? "an agent editor" : "a skill editor";

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
      You can view this {builderType} as a workspace admin, but you need to add
      yourself as an editor before making changes.
    </ContentMessage>
  );
}
