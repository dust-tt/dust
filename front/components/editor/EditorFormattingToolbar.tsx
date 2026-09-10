import { ToolBarContent } from "@app/components/assistant/conversation/input_bar/toolbar/ToolbarContent";
import { EditorSelectionToolbar } from "@app/components/editor/EditorSelectionToolbar";
import { useEditorLinkDialog } from "@app/components/editor/useEditorLinkDialog";
import { Toolbar, ToolbarLinkDialog } from "@dust-tt/sparkle";
import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";

interface EditorFormattingToolbarProps {
  editor: Editor;
  disabled?: boolean;
  /** Extra actions appended to the toolbar, after the formatting ones. */
  extraActions?: ReactNode;
}

/**
 * The formatting toolbar shown above an editor's selection, with the link dialog it opens.
 *
 * @cc [owner:rfrenoy,label:react] link-dialog-sibling-of-selection-toolbar
 * The link dialog MUST stay a sibling of `EditorSelectionToolbar`, never a descendant: opening it
 * blurs the editor, which hides the selection toolbar and would unmount the dialog with it.
 */
export function EditorFormattingToolbar({
  editor,
  disabled,
  extraActions,
}: EditorFormattingToolbarProps) {
  const { openLinkDialog, linkDialogProps } = useEditorLinkDialog(editor);

  return (
    <>
      <EditorSelectionToolbar editor={editor} disabled={disabled}>
        <Toolbar className="inline-flex">
          <ToolBarContent editor={editor} onOpenLinkDialog={openLinkDialog} />
          {extraActions}
        </Toolbar>
      </EditorSelectionToolbar>
      <ToolbarLinkDialog {...linkDialogProps} />
    </>
  );
}
