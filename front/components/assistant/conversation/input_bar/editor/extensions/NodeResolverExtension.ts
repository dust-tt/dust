import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "prosemirror-view";

import type { NodeCandidate, UrlCandidate } from "@app/lib/connectors";
import { nodeIdFromUrl } from "@app/lib/connectors";
import type { DataSourceViewContentNode } from "@app/types";

type NodeResolverOptions = {
  searchNodes: (
    candidate: UrlCandidate | NodeCandidate
  ) => Promise<DataSourceViewContentNode[]>;
  onNodeResolved: (node: DataSourceViewContentNode) => void;
  workspaceId: string;
};

// Define proper types for resolution entries
type ResolutionEntry = {
  url: string;
  from: number;
  to: number;
  attempts: number;
};

// Define the storage type
type NodeResolverStorage = {
  pendingResolutions: Map<string, ResolutionEntry>;
  resolvedNodes: Map<string, DataSourceViewContentNode>;
};

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

export const NodeResolverExtension = Extension.create<
  NodeResolverOptions,
  NodeResolverStorage
>({
  name: "nodeResolver",

  addOptions() {
    return {
      searchNodes: async () => [],
      onNodeResolved: () => {},
      workspaceId: ""
    };
  },

  addStorage() {
    return {
      pendingResolutions: new Map<string, ResolutionEntry>(),
      resolvedNodes: new Map<string, DataSourceViewContentNode>(),
    };
  },

  // clean up resources when editor is destroyed
  onDestroy() {
    this.storage.pendingResolutions.clear();
    this.storage.resolvedNodes.clear();
  },

  // add visual decorations for pending URLs
  addProseMirrorPlugins() {
    // Store a reference to this for use in the plugin
    const { editor } = this;
    const storage = this.storage;
    const options = this.options;
    const pluginKey = new PluginKey("nodeResolver");

    // Define the resolveUrl function that will be used in the plugin
    const resolveUrl = async (url: string, pos: number) => {
      const candidate = nodeIdFromUrl(url);
      if (!candidate) {
        return;
      }

      // Store position for replacement
      storage.pendingResolutions.set(url, {
        url,
        from: pos,
        to: pos + url.length,
        attempts: 0,
      });

      try {
        const nodes = await options.searchNodes(candidate);

        if (nodes.length > 0) {
          const node = nodes[0];

          // Only replace if still in pendingResolutions
          const entry = storage.pendingResolutions.get(url);
          if (entry) {
            editor.commands.insertContentAt(
              { from: entry.from, to: entry.to },
              {
                type: "dataSourceLink",
                attrs: {
                  nodeId: node.internalId,
                  title: node.title,
                  provider: node.dataSourceView.dataSource.connectorProvider,
                  spaceId: node.dataSourceView.spaceId,
                  url,
                },
              }
            );

            options.onNodeResolved(node);
            storage.resolvedNodes.set(url, node);
            storage.pendingResolutions.delete(url);
          }
        }
      } catch (error) {
        console.error("Error resolving node:", error);

        // increment attempt count for potential retry
        const data = storage.pendingResolutions.get(url);
        if (data && data.attempts < 3) {
          data.attempts++;
        } else {
          storage.pendingResolutions.delete(url);
        }
      }
    };

    return [
      new Plugin({
        key: pluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldState) {
            const decorations: Decoration[] = [];
            const doc = tr.doc;

            // Check for URLs in the entire document
            doc.descendants((node, pos) => {
              if (node.isText) {
                const text = node.text || "";
                let match;

                while ((match = URL_REGEX.exec(text)) !== null) {
                  const from = pos + match.index;
                  const to = from + match[0].length;
                  const url = match[0];

                  // Add URL decoration for pending resolutions
                  if (storage.pendingResolutions.has(url)) {
                    decorations.push(
                      Decoration.inline(from, to, {
                        class: "resolving-url",
                      })
                    );
                  }
                }
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
        props: {
          // Add decorations to the view
          decorations(state) {
            return this.getState(state);
          },
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain");
            if (!text) {
              return false;
            }

            const urls = text.match(URL_REGEX);
            if (urls) {
              urls.forEach((url) => {
                const { from } = view.state.selection;
                void resolveUrl(url, from);
              });
            }

            return false;
          },
          // Handle input to detect URLs as they are typed
          handleTextInput: (view, from, to, text) => {
            const doc = view.state.doc;
            const $from = doc.resolve(from);
            const textBefore = $from.parent.textBetween(
              Math.max(0, $from.parentOffset - 100),
              $from.parentOffset,
              ""
            );
            const combinedText = textBefore + text;
            const match = URL_REGEX.exec(combinedText);

            if (match && match[0].endsWith(text)) {
              void resolveUrl(match[0], from - (match[0].length - text.length));
            }

            return false;
          },
        },
      }),
    ];
  },
});
