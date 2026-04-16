import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_UNIQUE_ID_NODE_TYPES,
} from "@app/components/editor/extensions/instructions/BlockIdExtension";
import { INSTRUCTIONS_ROOT_NODE_NAME } from "@app/components/editor/extensions/instructions/InstructionsRootExtension";
import { buildSkillInstructionsExtensions } from "@app/lib/editor/build_skill_instructions_extensions";
import { preprocessMarkdownForEditor } from "@app/lib/editor/skill_instructions_preprocessing";
import { generateShortBlockId } from "@app/lib/generate_short_block_id";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type { JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { renderToHTMLString } from "@tiptap/static-renderer/pm/html-string";
import * as cheerio from "cheerio";

const SKILL_EDITOR_EXTENSIONS = buildSkillInstructionsExtensions(true, []);
const MARKDOWN_MANAGER = new MarkdownManager({
  extensions: SKILL_EDITOR_EXTENSIONS,
});
const NODE_TYPES_WITH_BLOCK_ID = new Set<string>([
  ...BLOCK_ID_UNIQUE_ID_NODE_TYPES,
  INSTRUCTIONS_ROOT_NODE_NAME,
]);

function htmlEncode(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function prepareNodesForStaticRenderer(node: JSONContent): JSONContent {
  if (node.type === "text" && typeof node.text === "string") {
    return { ...node, text: htmlEncode(node.text.replace(/\u200B/g, "")) };
  }

  if (
    node.type === "rawMarkdownBlock" &&
    typeof node.attrs?.rawContent === "string"
  ) {
    return {
      ...node,
      attrs: { ...node.attrs, rawContent: htmlEncode(node.attrs.rawContent) },
    };
  }

  if (node.content) {
    return {
      ...node,
      content: node.content.map(prepareNodesForStaticRenderer),
    };
  }

  return node;
}

function addBlockIds(node: JSONContent | undefined): void {
  if (!node?.type) {
    return;
  }

  if (NODE_TYPES_WITH_BLOCK_ID.has(node.type)) {
    node.attrs = { ...node.attrs };
    if (node.type === INSTRUCTIONS_ROOT_NODE_NAME) {
      node.attrs[BLOCK_ID_ATTRIBUTE] = INSTRUCTIONS_ROOT_TARGET_BLOCK_ID;
    } else if (node.attrs[BLOCK_ID_ATTRIBUTE] == null) {
      node.attrs[BLOCK_ID_ATTRIBUTE] = generateShortBlockId();
    }
  }

  node.content?.forEach(addBlockIds);
}

/**
 * Strip presentation attributes from HTML so it is not permanently stored.
 */
function stripPresentationAttributes(html: string): string {
  const $ = cheerio.load(html, { xmlMode: false }, false);
  // Strip class from all elements except <code>. The codeBlock extension
  // stores the fenced-code language as class="language-typescript", which is
  // the round-trip mechanism for recovering the language on generateJSON
  $("[class]").not("code").removeAttr("class");
  $("[style]").removeAttr("style");
  $("[id]").removeAttr("id");
  return $.html();
}

/**
 * TipTap's server-side parseHTMLToken has no DOM, so it converts block-level
 * HTML tokens (e.g. a standalone <knowledge .../> on its own line) to plain-
 * text paragraphs instead of calling generateJSON + parseHTML rules. Walk the
 * parsed JSON tree and restore any such nodes back to proper knowledgeNode
 * JSONContent before rendering to HTML.
 */
const KNOWLEDGE_TAG_REGEX = /^<knowledge\s+([^>]+)\s*\/>$/;

function recoverKnowledgeNodes(node: JSONContent): JSONContent {
  if (node.type === "paragraph" && node.content?.length === 1) {
    const child = node.content[0];
    if (child.type === "text") {
      const text = (child.text ?? "").trim();
      const match = KNOWLEDGE_TAG_REGEX.exec(text);
      if (match) {
        const attrs = match[1];
        const id = /id="([^"]+)"/.exec(attrs)?.[1];
        const title = /title="([^"]+)"/.exec(attrs)?.[1];
        if (id && title) {
          return {
            ...node,
            content: [
              {
                type: "knowledgeNode",
                attrs: {
                  selectedItems: [
                    {
                      nodeId: id,
                      label: title,
                      spaceId: /space="([^"]*)"/.exec(attrs)?.[1] ?? "",
                      dataSourceViewId: /dsv="([^"]*)"/.exec(attrs)?.[1] ?? "",
                      hasChildren: /hasChildren="true"/.test(attrs),
                    },
                  ],
                },
              },
            ],
          };
        }
      }
    }
  }
  if (node.content) {
    return { ...node, content: node.content.map(recoverKnowledgeNodes) };
  }
  return node;
}

/**
 * Convert Markdown to stored skill instructionsHtml.
 * Uses the same extension schema as the browser editor, then strips CSS class attrs.
 */
export function convertMarkdownToBlockHtml(markdown: string): string {
  const preprocessed = preprocessMarkdownForEditor(markdown);
  const parsedDoc = preprocessed.trim()
    ? MARKDOWN_MANAGER.parse(preprocessed)
    : null;

  const rawContent = parsedDoc?.content ?? [{ type: "paragraph" }];

  const json: JSONContent = {
    type: "doc",
    content: [
      {
        type: INSTRUCTIONS_ROOT_NODE_NAME,
        content: rawContent.map(recoverKnowledgeNodes),
      },
    ],
  };

  addBlockIds(json);

  const rendered = renderToHTMLString({
    content: prepareNodesForStaticRenderer(json),
    extensions: SKILL_EDITOR_EXTENSIONS,
  });

  return stripPresentationAttributes(rendered);
}
