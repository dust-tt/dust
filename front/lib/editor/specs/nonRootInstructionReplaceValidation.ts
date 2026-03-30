import { INSTRUCTIONS_SCHEMA } from "@app/lib/editor/specs/instructionsSchema";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import { JSDOM } from "jsdom";
import { DOMParser as PMDOMParser } from "prosemirror-model";

const instructionsParser = PMDOMParser.fromSchema(INSTRUCTIONS_SCHEMA);

/**
 * Validates HTML for suggest_prompt_edits when targetBlockId is not the
 * instructions root. Rejects:
 * - Several top-level blocks after schema parse (siblings under
 *   instructionsRoot).
 * - A single outer element that does not match any schema parseDOM rule (e.g.
 *   bare `<div>`): the editor treats those as transparent wrappers, so block
 *   count stays 1 even though the outer tag is wrong (`<div>test1</div>` after
 *   a `<p>` target is not a real “tag change”).
 */
export function validateNonRootInstructionReplaceHtml(
  targetBlockId: string,
  html: string
): Result<void, string> {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
  const tempDiv = dom.window.document.createElement("div");
  tempDiv.innerHTML = html;

  if (tempDiv.children.length === 1) {
    const outerEl = tempDiv.children[0];
    const matchedBySchema = instructionsParser.rules.some(
      (rule) => rule.tag && outerEl.matches(rule.tag)
    );
    if (!matchedBySchema) {
      return new Err(
        `Suggestion for block "${targetBlockId}" wraps content in <${outerEl.tagName.toLowerCase()}>, which is not a recognised block in the instructions editor. ` +
          `Bare <div> is not a block type here: the parser unwraps it, so this does not mean “replace the paragraph with a div”—the outcome depends on the inner HTML (plain text often becomes one paragraph; several inner blocks stay several). ` +
          `Use a semantic tag from the editor schema (<p>, headings, lists, code block, etc.) or ` +
          `<div data-type="instruction-block">...</div>. For multiple blocks use targetBlockId '${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}' with the root wrapper.`
      );
    }
  }

  const doc = instructionsParser.parse(tempDiv);
  const blockCount = doc.firstChild?.childCount ?? 0;
  if (blockCount > 1) {
    return new Err(
      `Suggestion for block "${targetBlockId}" contains ${blockCount} top-level blocks but replace only supports 1. ` +
        `Use one semantic block or a single <div data-type="instruction-block"> / <div data-type="${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}"> wrapper. ` +
        `Bare <div> and other unmapped wrappers are transparent: each child still counts as its own block. ` +
        `For multi-block changes use targetBlockId '${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}'.`
    );
  }

  return new Ok(undefined);
}
