import {
  combineTransactionSteps,
  Extension,
  findChildren,
  findChildrenInRange,
  findDuplicates,
  getChangedRanges,
} from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";

// Extension that adds IDs to all block nodes

export const BlockIdExtension = new Extension({
  name: "block-id",
  priority: 99999,
  addOptions: () => ({
    attributeName: "id",
    types: [],
    createId: () => window.crypto.randomUUID(),
  }),
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          [this.options.attributeName]: {
            default: null,
            parseHTML: (element) =>
              element.getAttribute(this.options.attributeName),
            renderHTML: (attributes) => {
              if (!attributes[this.options.attributeName]) {
                return {};
              }

              return {
                [this.options.attributeName]:
                  attributes[this.options.attributeName],
              };
            },
          },
        },
      },
    ];
  },
  // On creation, add the attribute to all nodes that should have an ID but don't have it yet
  onCreate() {
    const { tr, doc } = this.editor.state;
    const { types, attributeName, createId } = this.options;

    findChildren(
      doc,
      (node) =>
        types.includes(node.type.name) && node.attrs[attributeName] == null
    ).forEach(({ node, pos }) =>
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        [attributeName]: createId(),
      })
    );

    this.editor.view.dispatch(tr);
  },
  addProseMirrorPlugins() {
    let dragSourceElement = null;
    let transformPasted = false;

    return [
      new Plugin({
        key: new PluginKey("unique-id"),

        appendTransaction: (
          transactions,
          { doc: oldDoc },
          { doc: newDoc, tr }
        ) => {
          if (
            !transactions.some(({ docChanged }) => docChanged) ||
            oldDoc.eq(newDoc)
          ) {
            return;
          }

          const { types, attributeName, createId } = this.options;
          const transform = combineTransactionSteps(oldDoc, transactions);

          // get changed ranges based on the old state
          getChangedRanges(transform).forEach(({ newRange }) => {
            const newNodes = findChildrenInRange(newDoc, newRange, (node) =>
              types.includes(node.type.name)
            );

            const newIds = newNodes
              .map(({ node }) => node.attrs[attributeName])
              .filter((id) => id !== null);

            newNodes.forEach(({ node, pos }) => {
              // Get state from document, not from node, because the node might be outdated
              const id = tr.doc.nodeAt(pos)?.attrs[attributeName];

              if (id === null) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  [attributeName]: createId(),
                });

                return;
              }

              // check if the node doesn’t exist in the old state
              if (
                transform.mapping.invert().mapResult(pos) &&
                findDuplicates(newIds).includes(id)
              ) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  [attributeName]: createId(),
                });
              }
            });
          });

          if (!tr.steps.length) {
            return;
          }
          return tr;
        },

        // we register a global drag handler to track the current drag source element
        view(view) {
          const handleDragstart = (e) => {
            dragSourceElement = view.dom.parentElement?.contains(e.target)
              ? view.dom.parentElement
              : null;
          };

          window.addEventListener("dragstart", handleDragstart);

          return {
            destroy() {
              window.removeEventListener("dragstart", handleDragstart);
            },
          };
        },

        props: {
          // `handleDOMEvents` is called before `transformPasted`
          // so we can do some checks before
          handleDOMEvents: {
            // only create new ids for dropped content while holding `alt`
            // or content is dragged from another editor
            drop: (view, event) => {
              if (
                dragSourceElement !== view.dom.parentElement ||
                event.dataTransfer?.effectAllowed === "copy"
              ) {
                dragSourceElement = null;
                transformPasted = true;
              }

              return false;
            },
            // always create new ids on pasted content
            paste: () => {
              transformPasted = true;
              return false;
            },
          },

          // we’ll remove ids for every pasted node
          // so we can create a new one within `appendTransaction`
          transformPasted: (slice) => {
            if (!transformPasted) {
              return slice;
            }

            const { types, attributeName } = this.options;
            const removeId = (fragment) => {
              const list = [];

              fragment.forEach((node) => {
                // don’t touch text nodes
                if (node.isText) {
                  list.push(node);
                  return;
                }

                // check for any other child nodes
                if (!types.includes(node.type.name)) {
                  list.push(node.copy(removeId(node.content)));
                  return;
                }

                // remove id
                list.push(
                  node.type.create(
                    {
                      ...node.attrs,
                      [attributeName]: null,
                    },
                    removeId(node.content),
                    node.marks
                  )
                );
              });

              return Fragment.from(list);
            };

            // reset check
            transformPasted = false;

            return new Slice(
              removeId(slice.content),
              slice.openStart,
              slice.openEnd
            );
          },
        },
      }),
    ];
  },
});
