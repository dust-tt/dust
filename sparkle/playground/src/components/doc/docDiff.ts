import { markdownToHtml } from "./docMarkdown";

// What an agent's edit changed, block by block, for showing it over the
// document (Figma, Co-edition 305:2126). Blocks are matched by their text,
// then the words of a rewritten block: removed words come before the added
// ones, a rewritten sentence reads as one removal and one addition.

/** A change, placed on the blocks of the edited version. */
export type DiffHunk =
  | {
      kind: "inline";
      /** Index of the block in the edited version. */
      block: number;
      /** Where the change starts in the block's text. */
      offset: number;
      removed: string;
      addedLength: number;
    }
  | { kind: "insertedBlock"; block: number }
  | {
      kind: "deletedBlock";
      /** The block it followed in the edited version; -1 for the start. */
      afterBlock: number;
      text: string;
      /** Its element (p, h2, …), to show it as it was. */
      tag: string;
    };

export interface DocDiffResult {
  /** The text of each block of the edited version. */
  blocks: string[];
  hunks: DiffHunk[];
}

interface Block {
  text: string;
  tag: string;
}

/** The text blocks of a markdown document, as the editor splits it. */
function blocksOf(markdown: string): Block[] {
  const root = document.createElement("div");
  root.innerHTML = markdownToHtml(markdown);
  const blocks: Block[] = [];
  for (const element of root.querySelectorAll(
    "h1, h2, h3, h4, h5, h6, p, pre, li"
  )) {
    const tag = element.tagName.toLowerCase();
    if (tag === "li") {
      // A tight list item: its own text, without nested lists. Loose items
      // hold paragraphs, counted on their own.
      if (element.querySelector(":scope > p")) {
        continue;
      }
      const text = [...element.childNodes]
        .filter((n) => !(n instanceof Element && /^(UL|OL)$/.test(n.tagName)))
        .map((n) => n.textContent ?? "")
        .join("")
        .trim();
      blocks.push({ text, tag: "p" });
    } else {
      blocks.push({ text: element.textContent ?? "", tag });
    }
  }
  return blocks;
}

type Op<T> =
  | { type: "same"; a: T; b: T }
  | { type: "del"; a: T }
  | { type: "ins"; b: T };

/** Longest-common-subsequence diff of two sequences. */
function diff<T>(a: T[], b: T[], key: (item: T) => string): Op<T>[] {
  const ka = a.map(key);
  const kb = b.map(key);
  const lcs = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        ka[i] === kb[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const ops: Op<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (ka[i] === kb[j]) {
      ops.push({ type: "same", a: a[i++], b: b[j++] });
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ type: "del", a: a[i++] });
    } else {
      ops.push({ type: "ins", b: b[j++] });
    }
  }
  while (i < a.length) {
    ops.push({ type: "del", a: a[i++] });
  }
  while (j < b.length) {
    ops.push({ type: "ins", b: b[j++] });
  }
  return ops;
}

/**
 * Words both versions share between two changes, fewer than this, are part
 * of the change rather than alternating fragments.
 */
const MIN_KEPT_WORDS = 3;

type Run = { kept: string } | { removed: string; added: string };

/** The changes between two versions of a block, in the new one's offsets. */
function diffWords(
  before: string,
  after: string,
  block: number
): DiffHunk[] {
  const words = (text: string) => text.split(/(\s+)/).filter(Boolean);
  const runs: Run[] = [];
  for (const op of diff(words(before), words(after), (w) => w)) {
    const last = runs[runs.length - 1];
    if (op.type === "same") {
      if (last && "kept" in last) {
        last.kept += op.a;
      } else {
        runs.push({ kept: op.a });
      }
      continue;
    }
    let change = last && !("kept" in last) ? last : null;
    if (!change) {
      change = { removed: "", added: "" };
      runs.push(change);
    }
    if (op.type === "del") {
      change.removed += op.a;
    } else {
      change.added += op.b;
    }
  }
  // Short kept runs between two changes join them.
  const merged: Run[] = [];
  runs.forEach((run, i) => {
    const prev = merged[merged.length - 1];
    if (!("kept" in run)) {
      if (prev && !("kept" in prev)) {
        prev.removed += run.removed;
        prev.added += run.added;
      } else {
        merged.push({ ...run });
      }
      return;
    }
    const isShort =
      run.kept.trim().split(/\s+/).filter(Boolean).length < MIN_KEPT_WORDS;
    if (prev && !("kept" in prev) && runs[i + 1] && isShort) {
      prev.removed += run.kept;
      prev.added += run.kept;
    } else {
      merged.push(run);
    }
  });
  const hunks: DiffHunk[] = [];
  let offset = 0;
  for (const run of merged) {
    if ("kept" in run) {
      offset += run.kept.length;
      continue;
    }
    // Spaces at the end of a change stay outside it.
    const removed = run.removed.trimEnd();
    const added = run.added.trimEnd();
    if (removed || added) {
      hunks.push({
        kind: "inline",
        block,
        offset,
        removed,
        addedLength: added.length,
      });
    }
    offset += run.added.length;
  }
  return hunks;
}

export function diffDocuments(before: string, after: string): DocDiffResult {
  const ops = diff(blocksOf(before), blocksOf(after), (b) => b.text);
  const hunks: DiffHunk[] = [];
  const blocks: string[] = [];
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    if (op.type === "same") {
      blocks.push(op.b.text);
      continue;
    }
    // A block removed then one added in its place, of the same kind: one
    // block, with the changed words marked.
    const next = ops[k + 1];
    if (op.type === "del" && next?.type === "ins" && op.a.tag === next.b.tag) {
      hunks.push(...diffWords(op.a.text, next.b.text, blocks.length));
      blocks.push(next.b.text);
      k++;
    } else if (op.type === "del") {
      hunks.push({
        kind: "deletedBlock",
        afterBlock: blocks.length - 1,
        text: op.a.text,
        tag: op.a.tag,
      });
    } else {
      hunks.push({ kind: "insertedBlock", block: blocks.length });
      blocks.push(op.b.text);
    }
  }
  return { blocks, hunks };
}
