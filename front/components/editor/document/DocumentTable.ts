import type {
  CommandProps,
  JSONContent,
  MarkdownParseHelpers,
  MarkdownRendererHelpers,
  MarkdownToken,
  RawCommands,
  RenderContext,
} from "@tiptap/core";
import { findParentNode } from "@tiptap/core";
import {
  preprocessTablePipes,
  Table,
  TableCell,
  TableRow,
} from "@tiptap/extension-table";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const DOCUMENT_TABLE_NODE_NAME = "table";
export const TABLE_CELL_NODE_NAME = "tableCell";
export const TABLE_ROW_NODE_NAME = "tableRow";

export const findDocumentTable = findParentNode(
  (node) => node.type.name === DOCUMENT_TABLE_NODE_NAME
);

interface MarkdownTableCell {
  tokens: MarkdownToken[];
}

const isTableCell = (value: unknown): value is MarkdownTableCell =>
  typeof value === "object" &&
  value !== null &&
  "tokens" in value &&
  Array.isArray(value.tokens);

const tableCells = (value: unknown): MarkdownTableCell[] =>
  Array.isArray(value) ? value.filter(isTableCell) : [];

type ColumnAlignment = "left" | "center" | "right";

const COLUMN_ALIGNMENTS: readonly ColumnAlignment[] = [
  "left",
  "center",
  "right",
];

const isColumnAlignment = (value: unknown): value is ColumnAlignment =>
  COLUMN_ALIGNMENTS.some((alignment) => alignment === value);

const DELIMITERS: Record<ColumnAlignment, string> = {
  left: ":--",
  center: ":-:",
  right: "--:",
};

const columnAlignment = (table: JSONContent, column: number) =>
  (table.content ?? [])
    .map((row) => row.content?.[column]?.attrs?.align)
    .find(isColumnAlignment);

/** `table` with every cell aligned as its column is written: as the first aligned cell in it. */
export const withColumnAlignments = (table: JSONContent): JSONContent => {
  const width = Math.max(
    0,
    ...(table.content ?? []).map((row) => row.content?.length ?? 0)
  );
  const alignments = Array.from(
    { length: width },
    (_, column) => columnAlignment(table, column) ?? null
  );
  return {
    ...table,
    content: table.content?.map((row) => ({
      ...row,
      content: row.content?.map((cell, column) => ({
        ...cell,
        attrs: { ...cell.attrs, align: alignments[column] },
      })),
    })),
  };
};

/** Aligns every cell of the table holding the selection as its column is written. */
export const alignCellsToColumns = ({ tr }: CommandProps): boolean => {
  const table = findDocumentTable(tr.selection);
  if (!table) {
    return false;
  }
  const alignments: (ColumnAlignment | undefined)[] = [];
  table.node.forEach((row) =>
    row.forEach((cell, _, column) => {
      if (
        alignments[column] === undefined &&
        isColumnAlignment(cell.attrs.align)
      ) {
        alignments[column] = cell.attrs.align;
      }
    })
  );
  table.node.forEach((row, rowOffset) =>
    row.forEach((cell, cellOffset, column) => {
      const align = alignments[column] ?? null;
      if (cell.attrs.align !== align) {
        tr.setNodeAttribute(
          table.start + rowOffset + 1 + cellOffset,
          "align",
          align
        );
      }
    })
  );
  return true;
};

const UNESCAPED_PIPE = /(?<!\\)\|/;

const rowCellCount = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(UNESCAPED_PIPE).length;

/** Whether a row of `token` has more cells than its header, which marked drops. */
export const hasExtraCells = (token: MarkdownToken): boolean => {
  const [header, , ...rows] = preprocessTablePipes(token.raw ?? "")
    .split("\n")
    .filter((line) => line.trim());
  return (
    header !== undefined &&
    rows.some((row) => rowCellCount(row) > rowCellCount(header))
  );
};

const tableRows = (token: MarkdownToken): MarkdownTableCell[][] => [
  tableCells(token.header),
  ...(Array.isArray(token.rows) ? token.rows.map(tableCells) : []),
];

const parseTableMarkdown = (
  token: MarkdownToken,
  h: MarkdownParseHelpers
): JSONContent => {
  const alignments: unknown[] = Array.isArray(token.align) ? token.align : [];
  return h.createNode(
    DOCUMENT_TABLE_NODE_NAME,
    undefined,
    tableRows(token).map((cells) =>
      h.createNode(
        TABLE_ROW_NODE_NAME,
        {},
        cells.map((cell, column) =>
          h.createNode(
            TABLE_CELL_NODE_NAME,
            isColumnAlignment(alignments[column])
              ? { align: alignments[column] }
              : {},
            [h.createNode("paragraph", {}, h.parseInline(cell.tokens))]
          )
        )
      )
    )
  );
};

const cellMarkdown = (cell: JSONContent, h: MarkdownRendererHelpers) =>
  h
    .renderChildren(cell.content ?? [])
    .trim()
    .replace(/\|/g, "\\|");

const renderTableMarkdown = (
  node: JSONContent,
  h: MarkdownRendererHelpers,
  context: RenderContext
): string => {
  const rows = (node.content ?? []).map((row) =>
    (row.content ?? []).map((cell) => cellMarkdown(cell, h))
  );
  const width = Math.max(0, ...rows.map((cells) => cells.length));
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, index) => cells[index] ?? "").join(" | ")} |`;
  const delimiter = (column: number) => {
    const alignment = columnAlignment(node, column);
    return alignment ? DELIMITERS[alignment] : "---";
  };
  const [header = [], ...body] = rows;
  return [
    ...(context.parentType === "listItem" ? [""] : []),
    line(header),
    line(Array.from({ length: width }, (_, column) => delimiter(column))),
    ...body.map(line),
  ].join("\n");
};

export const DocumentTableCell = TableCell.extend({
  content: "paragraph",

  priority: 101,

  addKeyboardShortcuts() {
    const inCell = () => this.editor.isActive(TABLE_CELL_NODE_NAME);
    return {
      Enter: inCell,
      "Shift-Enter": inCell,
      "Mod-Enter": inCell,
    };
  },

  addAttributes() {
    return {
      colspan: { default: 1, parseHTML: () => 1 },
      rowspan: { default: 1, parseHTML: () => 1 },
      colwidth: { default: null, parseHTML: () => null },
      align: {
        default: null,
        parseHTML: () => null,
        renderHTML: ({ align }) =>
          isColumnAlignment(align) ? { style: `text-align: ${align}` } : {},
      },
    };
  },

  parseHTML() {
    return [...(this.parent?.() ?? []), { tag: "th" }];
  },
});

export const DocumentTableRow = TableRow.extend({
  content: `${TABLE_CELL_NODE_NAME}+`,
});

const HEADER_CELL_CLASS = "bg-muted-background font-semibold";

const headerRowKey = new PluginKey<DecorationSet>("documentTableHeaderRow");

const headerRowDecorations = (doc: ProseMirrorNode): DecorationSet => {
  const decorations: Decoration[] = [];
  doc.descendants((node, tablePos) => {
    if (node.type.name !== DOCUMENT_TABLE_NODE_NAME) {
      return node.isBlock && !node.isTextblock;
    }
    const rowContent = tablePos + 2;
    node.firstChild?.forEach((cell, cellOffset) => {
      const from = rowContent + cellOffset;
      decorations.push(
        Decoration.node(from, from + cell.nodeSize, {
          role: "columnheader",
          class: HEADER_CELL_CLASS,
        })
      );
    });
    return false;
  });
  return DecorationSet.create(doc, decorations);
};

const headerRowPlugin = () =>
  new Plugin<DecorationSet>({
    key: headerRowKey,
    state: {
      init: (_, state) => headerRowDecorations(state.doc),
      apply: (tr, decorations) =>
        tr.docChanged ? headerRowDecorations(tr.doc) : decorations,
    },
    props: {
      decorations: (state) => headerRowKey.getState(state),
    },
  });

const TABLE_COMMANDS = [
  "addColumnBefore",
  "addColumnAfter",
  "deleteColumn",
  "addRowBefore",
  "addRowAfter",
  "deleteRow",
  "deleteTable",
  "goToNextCell",
  "goToPreviousCell",
  "fixTables",
  "setCellSelection",
] as const;

export const DocumentTable = Table.extend({
  addCommands() {
    const commands = this.parent?.() ?? {};
    const kept: Partial<RawCommands> = {};
    for (const name of TABLE_COMMANDS) {
      Object.assign(kept, { [name]: commands[name] });
    }
    kept.insertTable =
      (options = {}) =>
      (props) =>
        commands.insertTable?.({ ...options, withHeaderRow: false })(props) ??
        false;
    return kept;
  },

  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), headerRowPlugin()];
  },

  parseMarkdown: parseTableMarkdown,
  renderMarkdown: renderTableMarkdown,
}).configure({ resizable: false });
