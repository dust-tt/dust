/** DOM content extraction – runs inside the page context via chrome.scripting.executeScript. */

export const extractPage = () => {
  // Clone so we can prune nodes without mutating the live DOM the user is viewing.
  const clone = document.body.cloneNode(true) as HTMLElement;

  // Strip non-content nodes: executable/styling tags, hidden elements, and SVGs
  // (which tend to be icon noise that bloats output without informational value).
  clone
    .querySelectorAll(
      'script, style, noscript, template, [hidden], [aria-hidden="true"], svg'
    )
    .forEach((el) => el.remove());

  // Prefer semantic main-content landmarks in priority order: explicit ARIA role,
  // then <main>, then <article>.
  const main =
    clone.querySelector('[role="main"]') ??
    clone.querySelector("main") ??
    clone.querySelector("article");

  // Asides often carry supporting context (TOC, related links, metadata) that
  // matters for downstream summarization, so keep them alongside the main content.
  const aside =
    clone.querySelector("aside") ??
    clone.querySelector('[role="complementary"]');

  if (main) {
    return [main, aside]
      .filter(Boolean)
      .map((el) => el!.innerHTML)
      .join("\n\n");
  }

  // Fallback for pages without semantic landmarks: return the whole pruned body.
  return clone.innerHTML;
};
