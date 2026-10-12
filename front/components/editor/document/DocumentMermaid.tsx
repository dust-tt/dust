import type { Translate } from "@app/components/editor/document/extensions";
import { isSafeMermaidChart, StyledMermaidGraph } from "@dust-tt/sparkle";
import { msg } from "@lingui/core/macro";
import { Extension } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { DOMSerializer } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView, NodeView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

/**
 * A code block in the `mermaid` language shows as its diagram, and as its code while the
 * selection is inside it. Presentation only: the document keeps the code block as it is.
 */

const MERMAID_LANGUAGE = "mermaid";
// Lets a collaborator's typing settle before the diagram renders again.
export const MERMAID_RENDER_DELAY_MS = 300;

const CODE_BLOCK_NODE_NAME = "codeBlock";
const BLOCK_ATTRIBUTE = "data-document-mermaid";
const EDITING_ATTRIBUTE = "data-mermaid-editing";
const NO_DIAGRAM_ATTRIBUTE = "data-mermaid-no-diagram";

const isMermaid = (node: Node) =>
  node.type.name === CODE_BLOCK_NODE_NAME &&
  node.attrs.language === MERMAID_LANGUAGE;

const documentMermaidKey = new PluginKey("documentMermaid");

/**
 * The Mermaid blocks the selection touches, marked so they show their code: selected code stays
 * visible. Only while editing: the selection starts at the document's start, inside a leading
 * block, before any focus.
 */
const editingDecorations = (state: EditorState) => {
  const { from, to } = state.selection;
  const decorations: Decoration[] = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (isMermaid(node)) {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, { [EDITING_ATTRIBUTE]: "" })
      );
    }
  });
  return DecorationSet.create(state.doc, decorations);
};

interface MermaidLabels {
  edit: string;
  error: string;
  /** For a chart that could load from another site, which is never rendered. */
  refused: string;
}

interface MermaidViewOptions {
  labels: MermaidLabels;
  /** Called when the document turns editable or read-only, which leaves node views as they are. */
  editabilityListeners: Set<() => void>;
}

interface MermaidDiagramProps {
  source: string;
  labels: MermaidLabels;
  /** Places the cursor in the code, or null when the document is not editable. */
  onEdit: (() => void) | null;
  /** Whether no diagram shows, so the code shows in its place. */
  onNoDiagram: (noDiagram: boolean) => void;
}

const MermaidDiagram = ({
  source,
  labels,
  onEdit,
  onNoDiagram,
}: MermaidDiagramProps) => {
  const [chart, setChart] = useState(source);
  const [shown, setShown] = useState(false);
  const [failed, setFailed] = useState(false);
  const empty = chart.trim() === "";
  const refused = !empty && !isSafeMermaidChart(chart);
  // Emptied or refused, the renderer unmounts with its diagram.
  const rendering = !empty && !refused;

  useEffect(() => {
    if (source === chart) {
      return;
    }
    const timer = setTimeout(() => setChart(source), MERMAID_RENDER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [source, chart]);

  useEffect(() => {
    onNoDiagram(!rendering || !shown);
  }, [rendering, shown, onNoDiagram]);

  // A later chart starts without a diagram.
  if (!rendering && shown) {
    setShown(false);
  }

  const onRender = useCallback((rendered: boolean) => {
    setFailed(!rendered);
    if (rendered) {
      setShown(true);
    }
  }, []);

  return (
    <>
      {rendering && (
        <div
          className="cursor-text group-data-[mermaid-editing]/mermaid:hidden"
          role={onEdit ? "button" : undefined}
          tabIndex={onEdit ? 0 : undefined}
          aria-label={onEdit ? labels.edit : undefined}
          onClick={(event) => {
            if (onEdit) {
              // A diagram's links do not open while it is editable, as the document's own.
              event.preventDefault();
              onEdit();
            }
          }}
          onKeyDown={(event) => {
            if (onEdit && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onEdit();
            }
          }}
        >
          <StyledMermaidGraph onRender={onRender}>{chart}</StyledMermaidGraph>
        </div>
      )}
      {(refused || (rendering && failed)) && (
        <p role="status" className="mt-2 text-muted-foreground copy-xs">
          {refused ? labels.refused : labels.error}
        </p>
      )}
    </>
  );
};

/** The code block's own markup, as the editor shows it without a node view. */
const codeBlockView = (node: Node) => {
  const spec = node.type.spec.toDOM?.(node);
  return spec
    ? DOMSerializer.renderSpec(document, spec)
    : { dom: document.createElement("pre"), contentDOM: undefined };
};

/** The code block's own markup, with its diagram under it and the code hidden behind it. */
function mermaidView(
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
  { labels, editabilityListeners }: MermaidViewOptions
): NodeView {
  const { dom: code, contentDOM } = codeBlockView(node);
  if (code instanceof HTMLElement) {
    code.classList.add(
      "hidden",
      "group-data-[mermaid-editing]/mermaid:block",
      "group-data-[mermaid-no-diagram]/mermaid:block"
    );
  }

  const dom = document.createElement("div");
  dom.className = "group/mermaid my-6";
  dom.setAttribute(BLOCK_ATTRIBUTE, "");
  const diagram = document.createElement("div");
  diagram.contentEditable = "false";
  dom.append(code, diagram);

  const onEdit = () => {
    const pos = getPos();
    if (pos === undefined || !view.editable) {
      return;
    }
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1))
    );
    view.focus();
  };
  const onNoDiagram = (noDiagram: boolean) =>
    dom.toggleAttribute(NO_DIAGRAM_ATTRIBUTE, noDiagram);

  const root = createRoot(diagram);
  let source = node.textContent;
  const render = () =>
    root.render(
      <MermaidDiagram
        source={source}
        labels={labels}
        onEdit={view.editable ? onEdit : null}
        onNoDiagram={onNoDiagram}
      />
    );
  render();
  editabilityListeners.add(render);

  return {
    dom,
    contentDOM,
    update: (next) => {
      if (!isMermaid(next)) {
        return false;
      }
      source = next.textContent;
      render();
      return true;
    },
    // The diagram is React's; only the code is the editor's.
    stopEvent: (event) =>
      event.target instanceof globalThis.Node && diagram.contains(event.target),
    ignoreMutation: (mutation) =>
      mutation.type !== "selection" && !code.contains(mutation.target),
    // Unmounting while React renders the editor would warn.
    destroy: () => {
      editabilityListeners.delete(render);
      queueMicrotask(() => root.unmount());
    },
  };
}

/**
 * @cc [owner:PopDaph,label:product] document-mermaid
 * A `mermaid` code block MUST show its diagram in place of its code, and its code while the
 * editor is focused and editable and the selection touches it, so a document opening with the
 * block shows its diagram; clicking the diagram of an editable document MUST place the cursor in
 * the code, including once the document turns editable. Its code MUST also show while no diagram
 * shows, with a note when the code is invalid. An invalid change MUST keep the last diagram, with
 * that note. A chart `isSafeMermaidChart` refuses MUST NOT render, and MUST show its code with a
 * note saying it refers to another website. It MUST only change how the block shows, never the
 * document. Other code blocks MUST show as before.
 */
export const documentMermaid = (t: Translate) =>
  Extension.create({
    name: "documentMermaid",
    addProseMirrorPlugins() {
      const { editor } = this;
      const labels: MermaidLabels = {
        edit: t(msg`Edit the diagram`),
        error: t(msg`This diagram has an error. Edit its code to fix it.`),
        refused: t(
          msg`This diagram isn't shown because it refers to another website.`
        ),
      };
      const options: MermaidViewOptions = {
        labels,
        editabilityListeners: new Set(),
      };
      return [
        new Plugin({
          key: documentMermaidKey,
          view: (editorView) => {
            let editable = editorView.editable;
            return {
              update: (next) => {
                if (next.editable !== editable) {
                  editable = next.editable;
                  options.editabilityListeners.forEach((listener) =>
                    listener()
                  );
                }
              },
            };
          },
          props: {
            // Recomputed on focus and blur, which the editor dispatches, and editability changes.
            decorations: (state) =>
              editor.isEditable && editor.isFocused
                ? editingDecorations(state)
                : DecorationSet.empty,
            nodeViews: {
              [CODE_BLOCK_NODE_NAME]: (node, view, getPos) =>
                isMermaid(node)
                  ? mermaidView(node, view, getPos, options)
                  : codeBlockView(node),
            },
          },
        }),
      ];
    },
  });
