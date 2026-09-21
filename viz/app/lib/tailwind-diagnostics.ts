const REPORT_DELAY_MS = 250;
const MAX_CLASSES_PER_MESSAGE = 50;

/**
 * @cc [owner:flvndvd,label:product;performance] missing-tailwind-usage
 * Only classes in the build's missing-class list may be reported. Each class MUST
 * be reported at most once per observer, including across DOM updates. Cleanup MUST
 * stop observation and cancel pending reports. Diagnostics MUST NOT modify content.
 */
export function observeMissingTailwindClasses(
  root: Element,
  missingClasses: readonly string[],
  report: (classNames: string[]) => void
): () => void {
  const missing = new Set(missingClasses);
  const seen = new Set<string>();
  const pending = new Set<string>();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    timeoutId = undefined;
    const classNames = Array.from(pending).sort();
    pending.clear();
    for (
      let index = 0;
      index < classNames.length;
      index += MAX_CLASSES_PER_MESSAGE
    ) {
      report(classNames.slice(index, index + MAX_CLASSES_PER_MESSAGE));
    }
  };

  const inspect = (element: Element) => {
    for (const className of Array.from(element.classList)) {
      if (missing.has(className) && !seen.has(className)) {
        seen.add(className);
        pending.add(className);
      }
    }
    if (pending.size > 0 && timeoutId === undefined) {
      timeoutId = setTimeout(flush, REPORT_DELAY_MS);
    }
  };

  const inspectTree = (element: Element) => {
    inspect(element);
    element.querySelectorAll("[class]").forEach(inspect);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === "attributes" &&
        mutation.target instanceof Element
      ) {
        inspect(mutation.target);
      }
      for (const node of Array.from(mutation.addedNodes)) {
        if (node instanceof Element) {
          inspectTree(node);
        }
      }
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  inspectTree(root);

  return () => {
    observer.disconnect();
    clearTimeout(timeoutId);
  };
}
