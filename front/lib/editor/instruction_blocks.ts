// Locating and replacing instruction blocks, shared by the editor's suggestion extension and the
// server-side apply path so both turn the same edit into the same document.
//
// Tiptap is imported for types only and the DOM is passed in rather than read from a global: the
// server holds a jsdom `document` and a cached parser, and pays no load cost for importing this.
import { KNOWLEDGE_TAG } from "@app/lib/editor/knowledge_node_constants";
import {
  BLOCK_ID_ATTRIBUTE,
  INSTRUCTIONS_ROOT_NODE_NAME,
} from "@app/lib/editor/node_constants";
import {
  SKILL_TAG_NAME,
  UNAVAILABLE_SKILL_TAG_NAME,
} from "@app/lib/skills/format";
import { TOOL_TAG_NAME } from "@app/lib/tools/format";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type {
  DOMParser as ProseMirrorDOMParser,
  Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import type { Transform } from "@tiptap/pm/transform";

// `UniqueID` stores the block id under `BLOCK_ID_ATTRIBUTE` and renders it `data-`-prefixed.
const BLOCK_ID_DOM_ATTRIBUTE = `data-${BLOCK_ID_ATTRIBUTE}`;

// HTML5 has no self-closing syntax for unknown elements: a parser reads `<skill ... />` as an
// *open* tag, so the text after it becomes its children and is dropped when the node parses as a
// leaf. The nodes' `renderHTML` already emits the paired form; model-authored edit content uses
// the self-closing form, so pair it up here before it reaches the DOM.
//
// The regex captures the tag name and the attributes, and pastes both back unchanged.
//
// Attributes are read one character at a time, or a whole quoted value at once. That second case
// matters because a name can hold a `>` (a skill named `A > B`, which `serializeSkillTag` leaves
// unescaped): stopping there would miss the `/>` and leave the tag self-closing.
const SELF_CLOSING_CUSTOM_TAG_REGEX = new RegExp(
  `<(${[
    KNOWLEDGE_TAG,
    SKILL_TAG_NAME,
    TOOL_TAG_NAME,
    UNAVAILABLE_SKILL_TAG_NAME,
  ].join("|")})(\\s(?:[^>"']|"[^"]*"|'[^']*')*?)?\\s*/>`,
  "g"
);

function pairSelfClosingCustomTags(html: string): string {
  return html.replace(
    SELF_CLOSING_CUSTOM_TAG_REGEX,
    (_match, tag: string, attributes: string | undefined) =>
      `<${tag}${attributes ?? ""}></${tag}>`
  );
}

/**
 * @cc [owner:flvndvd,label:security] instruction-html-parser-isolated
 * `parseInstructionsHtml` MUST parse LLM-authored HTML in an isolated context
 * that never executes scripts or loads resources. In the browser this means
 * using `DOMParser` (pass `htmlParser: new DOMParser()` in the options) rather
 * than assigning to `innerHTML` on a live-document element. The jsdom path on
 * the server is safe without `htmlParser` because jsdom never executes scripts.
 */
interface ParseInstructionsHtmlOptions {
  // The browser's `document` in the editor, a jsdom one on the server. Narrowed
  // to what this module calls: `Document` declares the whole spec, but jsdom
  // implements only part of it, so a wider type would let a browser-only call
  // through the compiler and fail on the server.
  document: Pick<Document, "createElement" | "adoptNode">;
  domParser: ProseMirrorDOMParser;
  // Drops every `data-block-id` before parsing, for content whose ids must not
  // be trusted.
  clearBlockIds?: boolean;
  // When provided, HTML is parsed in an isolated context via `parseFromString`
  // instead of being assigned to `innerHTML` on a live-document element.
  // Browser callers MUST supply `new DOMParser()` here to prevent XSS from
  // LLM-authored payloads (e.g. `<img src=x onerror=…>`).
  htmlParser?: Pick<DOMParser, "parseFromString">;
}

export function parseInstructionsHtml(
  html: string,
  {
    clearBlockIds = false,
    document,
    domParser,
    htmlParser,
  }: ParseInstructionsHtmlOptions
): ProseMirrorNode {
  const paired = pairSelfClosingCustomTags(html);

  let tempDiv: Element;
  if (htmlParser) {
    // Parse in an isolated document so scripts never execute and no resources
    // are loaded. Adopt the body element into the caller's document so that
    // ProseMirror's DOM parser, which uses the caller's schema, works normally.
    const isolated = htmlParser.parseFromString(paired, "text/html");
    // `isolated.body` is `HTMLBodyElement` (a subtype of `Element`).
    // `adoptNode` returns `Node`, so we capture the typed reference first and
    // adopt it; the result is the same object with the widened return type.
    const body = isolated.body;
    document.adoptNode(body);
    tempDiv = body;
  } else {
    // Server path: jsdom never executes scripts, so innerHTML is safe here.
    const div = document.createElement("div");
    div.innerHTML = paired;
    tempDiv = div;
  }

  if (clearBlockIds) {
    tempDiv
      .querySelectorAll(`[${BLOCK_ID_DOM_ATTRIBUTE}]`)
      .forEach((element) => element.removeAttribute(BLOCK_ID_DOM_ATTRIBUTE));
  }

  return domParser.parse(tempDiv);
}

/**
 * Parses an edit's HTML into the blocks it should replace its target with.
 *
 * The schema enforces doc > instructionsRoot > blocks, so parsing "<p>text</p>" returns
 * doc > instructionsRoot > paragraph. For root targets, return the instructionsRoot directly so
 * all child blocks are preserved. For single-block targets, return all children of the
 * instructionsRoot — this supports multi-block replacements where one block is replaced by
 * several (e.g., "<p>A</p><p>B</p>").
 */
export function parseHTMLToBlocks(
  html: string,
  targetBlockId: string,
  options: ParseInstructionsHtmlOptions
): ProseMirrorNode[] {
  const parsed = parseInstructionsHtml(html, options);

  const first = parsed.firstChild;
  if (
    first?.type.name === INSTRUCTIONS_ROOT_NODE_NAME &&
    targetBlockId === INSTRUCTIONS_ROOT_TARGET_BLOCK_ID
  ) {
    return [first];
  }

  const container =
    first?.type.name === INSTRUCTIONS_ROOT_NODE_NAME ? first : parsed;
  const children: ProseMirrorNode[] = [];
  container.content.forEach((child) => children.push(child));

  return children;
}

export function findBlockByBlockId(
  doc: ProseMirrorNode,
  targetBlockId: string
): { node: ProseMirrorNode; pos: number } | null {
  let result: { node: ProseMirrorNode; pos: number } | null = null;

  doc.descendants((node, pos) => {
    if (result) {
      return false;
    }

    if (node.attrs[BLOCK_ID_ATTRIBUTE] === targetBlockId) {
      result = { node, pos };

      return false;
    }

    return true;
  });

  return result;
}

export function replaceBlock(
  tr: Transform,
  { node: blockNode, pos: blockPos }: { node: ProseMirrorNode; pos: number },
  newNodes: ProseMirrorNode[]
): void {
  if (newNodes.length === 1) {
    const newNode = newNodes[0];
    if (blockNode.type === newNode.type) {
      // Same type: replace inner content.
      const from = blockPos + 1;
      const to = blockPos + blockNode.nodeSize - 1;
      tr.replaceWith(from, to, newNode.content);
    } else {
      // Cross-type: replace the entire block node.
      tr.replaceWith(blockPos, blockPos + blockNode.nodeSize, newNode);
    }
  } else {
    // Multi-block: replace the old block with all new blocks.
    tr.replaceWith(blockPos, blockPos + blockNode.nodeSize, newNodes);
  }
}
