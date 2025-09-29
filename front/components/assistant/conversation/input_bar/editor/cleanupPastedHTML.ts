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
