import type { Config } from "dompurify";
import DOMPurify from "dompurify";

// Minimal, conservative allowlist.
const SANITIZE_CONFIG: Config = {
  // Allow common text containers and formatting
  ALLOWED_TAGS: [
    "a",
    "p",
    "br",
    "div",
    "span",
    "b",
    "strong",
    "i",
    "em",
    "u",
    "s",
    "sub",
    "sup",
    "blockquote",
    "pre",
    "code",
    "hr",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
  ],

  // IMPORTANT: don't set ALLOWED_ATTR here.
  // Let DOMPurify use its safe defaults and explicitly allow data-* below.
  ALLOW_DATA_ATTR: true,

  // Strip dangerous containers entirely
  FORBID_TAGS: [
    "script",
    "style",
    "template",
    "iframe",
    "object",
    "embed",
    "link",
    "meta",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
    "video",
    "audio",
    "svg",
    "math",
    "base",
  ],

  // Remove styling/identifiers
  FORBID_ATTR: ["style", "class", "id"],

  // Keep text if unexpected wrappers appear
  KEEP_CONTENT: true,

  // Don't remove mustache-like text; leave templates alone
  SAFE_FOR_TEMPLATES: false,

  WHOLE_DOCUMENT: false,
  RETURN_TRUSTED_TYPE: false,
};

export function cleanupPastedHTML(html: string): string {
  addHookOnce();

  try {
    // DOMPurify sanitizes without executing anything; returns a safe string.
    return DOMPurify.sanitize(html, SANITIZE_CONFIG);
  } catch {
    // Secure fallback: return a text-only version (HTML-escaped), never the original unsanitized HTML.
    const temp = document.createElement("div");
    temp.textContent = html ?? "";
    return temp.innerHTML;
  }
}

let isHookAdded = false;

// Add hook to convert inline styles to semantic tags
function addHookOnce() {
  if (isHookAdded) {
    return;
  }
  isHookAdded = true;
  DOMPurify.addHook("uponSanitizeElement", (node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    // in fact it's an Element as per the check above
    if (!(node instanceof Element)) {
      return;
    }

    const element = node;
    const style = element.getAttribute("style");
    const tagName = element.tagName.toLowerCase();

    // Convert <br class="Apple-interchange-newline"> to empty text node (Apple paste metadata)
    // We replace it with a <span> but DOMPurify will handle the output formatting
    if (
      tagName === "br" &&
      element.getAttribute("class") === "Apple-interchange-newline"
    ) {
      // Create a text node with zero-width content to preserve document structure
      const textNode = document.createTextNode("");
      element.replaceWith(textNode);
      return;
    }

    if (style) {
      const isNormal = /font-weight:\s*normal/i.test(style);
      const isBold = /font-weight:\s*(?:700|bold)/i.test(style);
      const isItalic = /font-style:\s*italic/i.test(style);

      // If the tag is <b> or <strong> but has font-weight:normal, replace it with <span>
      // For whatever reason, Google Docs, in Chrome *only*, adds a <b style="font-weight:normal"> tag around text
      if (isNormal && (tagName === "b" || tagName === "strong")) {
        const span = document.createElement("span");
        // Copy all attributes except style
        for (const attr of element.attributes) {
          if (attr.name !== "style") {
            span.setAttribute(attr.name, attr.value);
          }
        }
        // Move all children
        while (element.firstChild) {
          span.appendChild(element.firstChild);
        }
        element.replaceWith(span);
        return;
      }

      // Wrap text content in semantic tags
      if (isBold || isItalic) {
        const fragment = document.createDocumentFragment();
        let wrapper: Node = fragment;

        if (isBold) {
          const strong = document.createElement("strong");
          wrapper.appendChild(strong);
          wrapper = strong;
        }

        if (isItalic) {
          const em = document.createElement("em");
          wrapper.appendChild(em);
          wrapper = em;
        }

        // Move children into wrapper
        while (node.firstChild) {
          wrapper.appendChild(node.firstChild);
        }

        node.appendChild(fragment);
      }

      // Remove style attribute
      element.removeAttribute("style");
    }
  });
}
