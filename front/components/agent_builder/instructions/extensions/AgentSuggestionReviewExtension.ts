import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view";

type BlockInfo = {
  from: number;
  to: number;
  hasAddition: boolean;
  hasDeletion: boolean;
};

type Group = {
  from: number;
  to: number;
  blocks: BlockInfo[];
};

const KEY = new PluginKey("agent_suggestion_review");

function collectMarkedBlocks(view: EditorView): BlockInfo[] {
  const blocks: BlockInfo[] = [];
  const additionType = view.state.schema.marks["addition"];
  const deletionType = view.state.schema.marks["deletion"];
  view.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let hasAddition = false;
    let hasDeletion = false;
    node.descendants((n) => {
      if (!n.isText) return true;
      if (!hasAddition && n.marks.some((m) => m.type === additionType)) hasAddition = true;
      if (!hasDeletion && n.marks.some((m) => m.type === deletionType)) hasDeletion = true;
      return !(hasAddition && hasDeletion);
    });
    if (hasAddition || hasDeletion) {
      blocks.push({ from: pos, to: pos + node.nodeSize, hasAddition, hasDeletion });
    }
    return true;
  });
  return blocks;
}

function groupBlocks(blocks: BlockInfo[]): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  for (const b of blocks) {
    if (!current) {
      current = { from: b.from, to: b.to, blocks: [b] };
      continue;
    }
    if (b.from <= current.to + 1) {
      current.blocks.push(b);
      if (b.to > current.to) current.to = b.to;
    } else {
      groups.push(current);
      current = { from: b.from, to: b.to, blocks: [b] };
    }
  }
  if (current) groups.push(current);
  return groups;
}

function buildDecorations(view: EditorView, groups: Group[]): DecorationSet {
  const decos: Decoration[] = [];
  groups.forEach((g) => {
    const widget = document.createElement("div");
    widget.className =
      "inline-flex items-center gap-1 rounded-md bg-slate-200/70 px-1 py-0.5 text-xs text-slate-700 shadow-sm dark:bg-slate-700/50 dark:text-slate-200";

    const btnUndo = document.createElement("button");
    btnUndo.textContent = "Undo";
    btnUndo.setAttribute("data-action", "reject");
    btnUndo.className =
      "cursor-pointer rounded px-1 py-0.5 hover:bg-slate-300/80 dark:hover:bg-slate-600/70";

    const btnKeep = document.createElement("button");
    btnKeep.textContent = "Keep";
    btnKeep.setAttribute("data-action", "accept");
    btnKeep.className =
      "cursor-pointer rounded px-1 py-0.5 hover:bg-slate-300/80 dark:hover:bg-slate-600/70";

    // Order: Undo (left), Keep (right)
    widget.appendChild(btnUndo);
    widget.appendChild(btnKeep);

    // Anchor at end of group
    const deco = Decoration.widget(g.to, widget, {
      side: 1,
      key: `${g.from}-${g.to}`,
    });
    decos.push(deco);
  });
  return DecorationSet.create(view.state.doc, decos);
}

function removeMarkRange(view: EditorView, from: number, to: number, markName: string) {
  const { state } = view;
  const type = state.schema.marks[markName];
  if (!type) return;
  view.dispatch(state.tr.removeMark(from, to, type));
}

function deleteRange(view: EditorView, from: number, to: number) {
  const { state } = view;
  if (from < to) {
    view.dispatch(state.tr.delete(from, to));
  }
}

function acceptGroup(view: EditorView, group: Group) {
  const { state } = view;
  const additionType = state.schema.marks["addition"];
  const deletionType = state.schema.marks["deletion"];
  let tr = state.tr;

  const mapRange = (from: number, to: number): [number, number] => {
    const mappedFrom = tr.mapping.map(from);
    const mappedTo = tr.mapping.map(to);
    const docSize = tr.doc.content.size;
    const fromClamped = Math.max(0, Math.min(mappedFrom, docSize));
    const toClamped = Math.max(fromClamped, Math.min(mappedTo, docSize));
    return [fromClamped, toClamped];
  };

  // First, remove paragraphs that represent deletions only
  for (let i = group.blocks.length - 1; i >= 0; i--) {
    const b = group.blocks[i];
    if (b.hasDeletion && !b.hasAddition) {
      const [from, to] = mapRange(b.from, b.to);
      if (to > from) tr = tr.delete(from, to);
    }
  }

  // Then strip addition marks from the kept new text
  group.blocks.forEach((b) => {
    if (b.hasAddition) {
      const [from, to] = mapRange(b.from, b.to);
      if (to > from) tr = tr.removeMark(from, to, additionType);
    }
  });

  if (tr.docChanged) view.dispatch(tr);
}

function rejectGroup(view: EditorView, group: Group) {
  const { state } = view;
  const additionType = state.schema.marks["addition"];
  const deletionType = state.schema.marks["deletion"];
  let tr = state.tr;

  const mapRange = (from: number, to: number): [number, number] => {
    const mappedFrom = tr.mapping.map(from);
    const mappedTo = tr.mapping.map(to);
    const docSize = tr.doc.content.size;
    const fromClamped = Math.max(0, Math.min(mappedFrom, docSize));
    const toClamped = Math.max(fromClamped, Math.min(mappedTo, docSize));
    return [fromClamped, toClamped];
  };

  // Remove paragraphs that represent additions only
  for (let i = group.blocks.length - 1; i >= 0; i--) {
    const b = group.blocks[i];
    if (b.hasAddition && !b.hasDeletion) {
      const [from, to] = mapRange(b.from, b.to);
      if (to > from) tr = tr.delete(from, to);
    }
  }

  // Strip deletion marks to restore original text
  group.blocks.forEach((b) => {
    if (b.hasDeletion) {
      const [from, to] = mapRange(b.from, b.to);
      if (to > from) tr = tr.removeMark(from, to, deletionType);
    }
  });

  if (tr.docChanged) view.dispatch(tr);
}

function findGroupAtPos(groups: Group[], pos: number): Group | null {
  for (const g of groups) {
    if (pos >= g.from && pos <= g.to) return g;
  }
  // find nearest by anchor
  let best: Group | null = null;
  let bestDist = Infinity;
  for (const g of groups) {
    const dist = Math.min(Math.abs(pos - g.from), Math.abs(pos - g.to));
    if (dist < bestDist) {
      best = g;
      bestDist = dist;
    }
  }
  return best;
}

export const AgentSuggestionReviewExtension = Extension.create({
  name: "agentSuggestionReview",

  addProseMirrorPlugins() {
    // Keep current decorations in closure; recompute on each view.update
    let currentDecorations: DecorationSet = DecorationSet.empty;
    let hadTokens = false;
    return [
      new Plugin({
        key: KEY,
        props: {
          decorations(_state) {
            return currentDecorations;
          },
          handleClick(view, pos, event) {
            const target = event.target as HTMLElement;
            if (!target) return false;
            const action = target.getAttribute("data-action");
            if (!action) return false;

            const blocks = collectMarkedBlocks(view);
            const groups = groupBlocks(blocks);
            const group = findGroupAtPos(groups, pos);
            if (!group) return true;

            if (action === "accept") {
              acceptGroup(view, group);
            } else if (action === "reject") {
              rejectGroup(view, group);
            }
            return true;
          },
        },
        view(view) {
          return {
            update(v) {
              const blocks = collectMarkedBlocks(v);
              const groups = groupBlocks(blocks);
              currentDecorations = buildDecorations(v, groups);
              const hasTokens = blocks.length > 0;
              if (hadTokens && !hasTokens) {
                if (typeof window !== "undefined") {
                  window.dispatchEvent(
                    new CustomEvent("dust:inline-review-resolved")
                  );
                }
              }
              hadTokens = hasTokens;
            },
          };
        },
      }),
    ];
  },
});
