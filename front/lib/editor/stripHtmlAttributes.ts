import DOMPurify from "isomorphic-dompurify";

/**
 * Strip style, class, and id attributes from HTML while preserving all tags.
 * Uses isomorphic-dompurify so it works in both browser and Node.js.
 */
export function stripHtmlAttributes(html: string): string {
  try {
    return DOMPurify.sanitize(html, {
      ADD_TAGS: ["*"],
      FORBID_ATTR: ["style", "class", "id"],
    });
  } catch {
    // Fallback: return the original HTML if sanitization fails.
    return html;
  }
}
