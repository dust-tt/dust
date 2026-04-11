import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_UNIQUE_ID_NODE_TYPES,
} from "@app/components/editor/extensions/instructions/BlockIdExtension";
import { INSTRUCTIONS_ROOT_NODE_NAME } from "@app/components/editor/extensions/instructions/InstructionsRootExtension";
import { buildSkillInstructionsExtensions } from "@app/lib/editor/build_skill_instructions_extensions";
import { preprocessMarkdown } from "@app/lib/editor/skill_instructions_preprocessing";
import { generateShortBlockId } from "@app/lib/generate_short_block_id";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type { JSONContent } from "@tiptap/core";
import { generateJSON } from "@tiptap/html/server";
import { MarkdownManager } from "@tiptap/markdown";
import { renderToHTMLString } from "@tiptap/static-renderer/pm/html-string";
import * as cheerio from "cheerio";

const SKILL_EDITOR_EXTENSIONS = buildSkillInstructionsExtensions(true, [], {
  serverSide: true,
});
const MARKDOWN_MANAGER = new MarkdownManager({
  extensions: SKILL_EDITOR_EXTENSIONS,
});
const NODE_TYPES_WITH_BLOCK_ID = new Set<string>([
  ...BLOCK_ID_UNIQUE_ID_NODE_TYPES,
  INSTRUCTIONS_ROOT_NODE_NAME,
]);

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
  $("[class], [style], [id]")
    .removeAttr("class")
    .removeAttr("style")
    .removeAttr("id");
  return $.html();
}

/**
 * Convert Markdown to stored skill instructionsHtml.
 * Uses the same extension schema as the browser editor, then strips CSS class attrs.
 */
export function convertMarkdownToBlockHtml(markdown: string): string {
  const preprocessed = markdown.trim() ? preprocessMarkdown(markdown) : null;
  const parsedDoc = preprocessed ? MARKDOWN_MANAGER.parse(preprocessed) : null;

  const json: JSONContent = {
    type: "doc",
    content: [
      {
        type: INSTRUCTIONS_ROOT_NODE_NAME,
        content: parsedDoc?.content ?? [{ type: "paragraph" }],
      },
    ],
  };

  addBlockIds(json);

  const rendered = renderToHTMLString({
    content: json,
    extensions: SKILL_EDITOR_EXTENSIONS,
  });

  return stripPresentationAttributes(rendered);
}

/**
 * Convert stored skill instructionsHtml back to Markdown.
 * Used by migration validation to round-trip against original instructions.
 */
export function convertBlockHtmlToMarkdown(html: string): string {
  const json = generateJSON(html, SKILL_EDITOR_EXTENSIONS);
  return MARKDOWN_MANAGER.serialize(json);
}
