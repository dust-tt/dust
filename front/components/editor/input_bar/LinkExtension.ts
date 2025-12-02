import Link from "@tiptap/extension-link";

export const LinkExtension = Link.extend({
  renderHTML({ HTMLAttributes }) {
    const href = HTMLAttributes.href ?? "";
    return [
      "span",
      {
        ...HTMLAttributes,
        title: href, // Add title attribute to show URL as tooltip
      },
      0,
    ];
  },
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      "Mod-k": () => {
        // This event is caught by the ToolbarLink component to open the link dialog
        const event = new CustomEvent("dust:openLinkDialog", {
          detail: { editor: this.editor },
        });
        window.dispatchEvent(event);
        return true;
      },
    };
  },
});
