import type { Editor } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const OPEN_LINK_DIALOG_EVENT = "dust:openLinkDialog";

export type OpenLinkDialogEvent = CustomEvent<{ editor: Editor }>;

export function isOpenLinkDialogEventFor(
  event: Event,
  editor: Editor
): boolean {
  if (!(event instanceof CustomEvent)) {
    return false;
  }
  const { detail } = event;
  return (
    typeof detail === "object" &&
    detail !== null &&
    "editor" in detail &&
    detail.editor === editor
  );
}

export const LinkExtension = Link.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      "Mod-Shift-u": () => {
        // Caught by the editor's link dialog, which carries the editor so that only the one the
        // shortcut was pressed in reacts.
        const event: OpenLinkDialogEvent = new CustomEvent(
          OPEN_LINK_DIALOG_EVENT,
          { detail: { editor: this.editor } }
        );
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
