import { alignCellsToColumns } from "@app/components/editor/document/DocumentTable";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  HoveringBar,
  Plus,
  Table,
  Trash01,
} from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { ChainedCommands, Editor } from "@tiptap/core";
import { findParentNode, isTextSelection } from "@tiptap/core";
import type { EditorState, Selection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { useEditorState } from "@tiptap/react";
import type { BubbleMenuProps } from "@tiptap/react/menus";
import { BubbleMenu } from "@tiptap/react/menus";
import { useMemo } from "react";

const TABLE_TOOLBAR_ATTRIBUTE = "data-document-table-toolbar";

const findTable = findParentNode((node) => node.type.name === "table");

const isCellSelection = (selection: Selection): selection is CellSelection =>
  selection instanceof CellSelection;

const isElement = (node: Node | null): node is Element =>
  node instanceof Element;

/** Whether the cursor sits in a table without selecting text, which the selection toolbar owns. */
const isInTable = ({ selection }: EditorState) =>
  isCellSelection(selection) ||
  (isTextSelection(selection) && selection.empty && !!findTable(selection));

const isInFirstRow = (state: EditorState) => {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === "tableRow") {
      return $from.index(depth - 1) === 0;
    }
  }
  return false;
};

const showTableToolbar: NonNullable<BubbleMenuProps["shouldShow"]> = ({
  editor,
  view,
  state,
}) =>
  editor.isEditable &&
  isInTable(state) &&
  (editor.isFocused ||
    !!view.dom.ownerDocument.activeElement?.closest(
      `[${TABLE_TOOLBAR_ATTRIBUTE}]`
    ));

const tableElement = (editor: Editor) => {
  const table = findTable(editor.state.selection);
  const dom = table ? editor.view.nodeDOM(table.pos) : null;
  return isElement(dom) ? dom : null;
};

/** Keeps the editor's selection, and so the toolbar, while a control is pressed. */
const keepSelection = (event: React.MouseEvent) => event.preventDefault();

interface DocumentTableToolbarProps {
  editor: Editor;
}

export const DocumentTableToolbar = ({ editor }: DocumentTableToolbarProps) => {
  const { t } = useLingui();
  const { inFirstRow } = useEditorState({
    editor,
    selector: ({ editor }) => ({ inFirstRow: isInFirstRow(editor.state) }),
  });
  const options = useMemo(
    (): BubbleMenuProps["options"] => ({ placement: "top-end", offset: 8 }),
    []
  );
  const getReferencedVirtualElement = useMemo(
    () => () => tableElement(editor),
    [editor]
  );
  const editTable = t({
    message: "Edit table",
    context: "document table toolbar",
  });
  const run = (command: (chain: ChainedCommands) => ChainedCommands) => () =>
    command(editor.chain().focus()).run();

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="documentTableToolbar"
      options={options}
      getReferencedVirtualElement={getReferencedVirtualElement}
      className="relative z-40 font-sans text-foreground antialiased print:hidden"
      shouldShow={showTableToolbar}
    >
      <div
        role="toolbar"
        aria-label={t({ message: "Table", context: "document table toolbar" })}
        {...{ [TABLE_TOOLBAR_ATTRIBUTE]: "" }}
      >
        <HoveringBar size="xs">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                size="xs"
                variant="ghost-secondary"
                icon={Table}
                tooltip={editTable}
                aria-label={editTable}
                isSelect
                onMouseDown={keepSelection}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" mountPortal={false}>
              {!inFirstRow && (
                <DropdownMenuItem
                  icon={Plus}
                  label={t`Add row above`}
                  onClick={run((chain) =>
                    chain.addRowBefore().command(alignCellsToColumns)
                  )}
                />
              )}
              <DropdownMenuItem
                icon={Plus}
                label={t`Add row below`}
                onClick={run((chain) =>
                  chain.addRowAfter().command(alignCellsToColumns)
                )}
              />
              <DropdownMenuItem
                icon={Plus}
                label={t`Add column left`}
                onClick={run((chain) => chain.addColumnBefore())}
              />
              <DropdownMenuItem
                icon={Plus}
                label={t`Add column right`}
                onClick={run((chain) => chain.addColumnAfter())}
              />
              <DropdownMenuSeparator />
              <DropdownMenuItem
                icon={Trash01}
                label={t`Delete row`}
                variant="warning"
                onClick={run((chain) => chain.deleteRow())}
              />
              <DropdownMenuItem
                icon={Trash01}
                label={t`Delete column`}
                variant="warning"
                onClick={run((chain) => chain.deleteColumn())}
              />
              <DropdownMenuItem
                icon={Trash01}
                label={t`Delete table`}
                variant="warning"
                onClick={run((chain) => chain.deleteTable())}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </HoveringBar>
      </div>
    </BubbleMenu>
  );
};
