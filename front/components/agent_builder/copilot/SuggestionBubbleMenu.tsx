import { Button, CheckIcon, HoveringBar, XMarkIcon } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";

import { useCopilotSuggestionsOptional } from "@app/components/agent_builder/copilot/CopilotSuggestionsContext";

interface SuggestionBubbleMenuProps {
  editor: Editor;
}

/**
 * BubbleMenu that appears when the cursor is on a suggestion mark.
 * Provides Accept/Reject buttons for the current suggestion.
 */
export function SuggestionBubbleMenu({ editor }: SuggestionBubbleMenuProps) {
  const suggestionsContext = useCopilotSuggestionsOptional();

  // Check if cursor is on a suggestion mark.
  const isOnSuggestion = () => {
    return (
      editor.isActive("suggestionAddition") ||
      editor.isActive("suggestionDeletion")
    );
  };

  // Get the suggestion ID at the current position.
  const getCurrentSuggestionId = (): string | null => {
    const { state } = editor;
    const { from } = state.selection;
    const $pos = state.doc.resolve(from);
    const marks = $pos.marks();

    for (const mark of marks) {
      if (
        mark.type.name === "suggestionAddition" ||
        mark.type.name === "suggestionDeletion"
      ) {
        return mark.attrs.suggestionId as string | null;
      }
    }

    return null;
  };

  const handleAccept = () => {
    const suggestionId = getCurrentSuggestionId();
    if (suggestionId && suggestionsContext) {
      suggestionsContext.acceptSuggestion(suggestionId);
    }
  };

  const handleReject = () => {
    const suggestionId = getCurrentSuggestionId();
    if (suggestionId && suggestionsContext) {
      suggestionsContext.rejectSuggestion(suggestionId);
    }
  };

  // Don't render if context is not available.
  if (!suggestionsContext) {
    return null;
  }

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={isOnSuggestion}
      options={{
        placement: "top",
        offset: 8,
      }}
    >
      <HoveringBar size="xs">
        <Button
          icon={XMarkIcon}
          size="xs"
          variant="ghost"
          tooltip="Reject suggestion"
          label="Reject"
          onClick={handleReject}
        />
        <HoveringBar.Separator />
        <Button
          icon={CheckIcon}
          size="xs"
          variant="highlight"
          tooltip="Accept suggestion"
          label="Accept"
          onClick={handleAccept}
        />
      </HoveringBar>
    </BubbleMenu>
  );
}
