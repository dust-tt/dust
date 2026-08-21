import Link from "@tiptap/extension-link";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const LinkExtension = Link.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      "Mod-Shift-u": () => {
        // This event is caught by the toolbar content to open the link dialog.
        const event = new CustomEvent("dust:openLinkDialog");
        window.dispatchEvent(event);
        return true;
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: new PluginKey("linkClickHandler"),
        view() {
          // Inject CSS once for pointer cursor when holding cmd/ctrl
          const style = document.createElement("style");
          style.textContent = `.ProseMirror.link-clickable a { cursor: pointer; }`;
          document.head.appendChild(style);
          return {
            destroy() {
              style.remove();
            },
          };
        },
        props: {
          handleDOMEvents: {
            keydown(view, event) {
              if (event.metaKey || event.ctrlKey) {
                view.dom.classList.add("link-clickable");
              }
              return false;
            },
            keyup(view) {
              view.dom.classList.remove("link-clickable");
              return false;
            },
            blur(view) {
              view.dom.classList.remove("link-clickable");
              return false;
            },
            mousedown(_view, event) {
              const link = (event.target as HTMLElement)?.closest("a");
              if (!link) {
                return false;
              }

              // Cmd+click: open link and focus the new tab
              if (event.ctrlKey || event.metaKey) {
                const href = link.getAttribute("href");
                if (href) {
                  const newWindow = window.open(href, "_blank");
                  newWindow?.focus();
                }
                return true;
              }

              return false;
            },
          },
        },
      }),
    ];
  },
});
