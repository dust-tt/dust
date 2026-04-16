export function getBlockOuterHtml(
  instructionsHtml: string,
  targetBlockId: string
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(instructionsHtml, "text/html");
  const targetElement = doc.querySelector(`[data-block-id="${targetBlockId}"]`);
  return targetElement ? targetElement.outerHTML : "";
}
