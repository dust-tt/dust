export function getBlockOuterHtml(
  instructionsHtml: string,
  targetBlockId: string
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(instructionsHtml, "text/html");
  const targetElement = doc.querySelector(`[data-block-id="${targetBlockId}"]`);
  return targetElement ? targetElement.outerHTML : "";
}

// Splits serialized instructions HTML into its top-level blocks (each keeps its
// `data-block-id`). Emitting one block per array entry keeps `get_agent_config`
// output paginatable line-by-line: a single escaped >20KB string is unreachable
// past the file-read byte cap, whereas one block per line is not.
export function splitInstructionsHtmlBlocks(
  instructionsHtml: string
): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(instructionsHtml, "text/html");
  return Array.from(doc.body.children).map((el) => el.outerHTML);
}
