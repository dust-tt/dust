import { Node } from "@tiptap/core";

export interface RawHtmlAttributes {
  html: string;
}

/**
 * Extension to preserve raw HTML in markdown round-trips.
 *
 * When markdown containing HTML (like <a>, <span>, <div> tags) is parsed,
 * this extension captures the HTML via parseHTML and stores the element's
 * outerHTML, ensuring it gets serialized back to HTML format in markdown.
 *
 * Note: The HTML is reconstructed from the DOM, so formatting may change
 * slightly (e.g., <br/> becomes <br />), but the semantic content is preserved.
 */
export const RawHtmlExtension = Node.create<RawHtmlAttributes>({
  name: "rawHtml",
  group: "inline",
  inline: true,

  addAttributes() {
    return {
      html: {
        default: "",
      },
    };
  },

  parseHTML() {
    // List of HTML tags we want to preserve as raw HTML
    // For a, li, ul tags, we use priority 1001 to override the associated extension (priority 1000)
    const tags = [
      { tag: "a", priority: 1001 },
      { tag: "ul", priority: 1001 },
      { tag: "li", priority: 1001 },
      { tag: "span" },
      { tag: "div" },
      { tag: "section" },
      { tag: "article" },
      { tag: "aside" },
      { tag: "nav" },
      { tag: "img" },
      { tag: "button" },
      { tag: "input" },
      { tag: "form" },
      { tag: "label" },
      { tag: "select" },
      { tag: "textarea" },
      { tag: "table" },
      { tag: "thead" },
      { tag: "tbody" },
      { tag: "tr" },
      { tag: "td" },
      { tag: "th" },
    ];

    return tags.map((config) => ({
      ...config,
      getAttrs: (element) => ({
        html: (element as HTMLElement).outerHTML,
      }),
    }));
  },

  renderHTML({ node }) {
    // In the editor, we display the HTML as text inside a styled span
    // This makes it visible but doesn't actually render the HTML
    return [
      "span",
      {
        "data-raw-html": node.attrs.html,
      },
      node.attrs.html,
    ];
  },

  renderMarkdown: (node) => {
    // Output the original HTML in the markdown
    return node.attrs?.html ?? "";
  },
});
