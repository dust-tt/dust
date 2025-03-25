import { DataSourceComponentLink } from "@dust-tt/sparkle";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import { Decoration, DecorationSet } from "prosemirror-view";

import type { NodeCandidate, UrlCandidate } from "@app/lib/connectors";
import { isUrlCandidate, nodeIdFromUrl } from "@app/lib/connectors";

type URLFormatOptions = {
  onUrlDetected?: (candidate: UrlCandidate | NodeCandidate) => void;
};

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

interface UrlMetadata {
  title: string;
  description?: string;
  imageUrl?: string;
  type: string;
}

interface URLStorage {
  pendingUrls: Map<
    string,
    {
      url: string;
      nodeId: string;
      from: number;
      to: number;
    }
  >;
  renderers: Map<string, ReactRenderer>;
  metadata: Map<string, UrlMetadata>;
}

export const URLDetectionExtension = Extension.create<URLFormatOptions>({
  name: "urlDetection",

  addOptions() {
    return {
      onUrlDetected: undefined,
    };
  },

  addStorage() {
    return {
      pendingUrls: new Map(),
      renderers: new Map(),
      metadata: new Map(),
    } as URLStorage;
  },

  onDestroy() {
    // Cleanup renderers
    const storage = this.editor.storage.URLStorage;
    storage.renderers.forEach((renderer) => renderer.destroy());
    storage.renderers.clear();
  },

  async fetchUrlMetadata(url: string): Promise<UrlMetadata | null> {
    try {
      const response = await fetch(`/api/url-metadata`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        throw new Error("Failed to fetch URL metadata");
      }

      const data = await response.json();
      return {
        title: data.title,
        description: data.description,
        imageUrl: data.imageUrl,
        type: data.type,
      };
    } catch (error) {
      console.error("Error fetching URL metadata:", error);
      return null;
    }
  },

  async createUrlPreview(url: string, element: HTMLElement) {
    const storage = this.editor.storage.URLStorage;
    let metadata = storage.metadata.get(url);

    if (!metadata) {
      metadata = await this.fetchUrlMetadata(url);
      if (metadata) {
        storage.metadata.set(url, metadata);
      }
    }

    if (!metadata) {
      return null;
    }

    const renderer = new ReactRenderer(DataSourceComponentLink, {
      props: {
        title: metadata.title,
        description: metadata.description,
        imageUrl: metadata.imageUrl,
        url: url,
        type: metadata.type,
      },
      editor: this.editor,
    });

    storage.renderers.set(url, renderer);
    element.appendChild(renderer.element);
    return renderer;
  },

  addProseMirrorPlugins() {
    const { onUrlDetected } = this.options;
    const storage = this.editor.storage.URLStorage;
    const extension = this;

    return [
      new Plugin({
        key: new PluginKey("urlDetection"),
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldState) {
            const decorations: Decoration[] = [];
            const doc = tr.doc;

            doc.descendants((node, pos) => {
              if (node.isText) {
                const text = node.text || "";
                let match;

                while ((match = URL_REGEX.exec(text)) !== null) {
                  const from = pos + match.index;
                  const to = from + match[0].length;
                  const url = match[0];

                  // Add URL decoration
                  decorations.push(
                    Decoration.mark({
                      class: "detected-url",
                    }).range(from, to)
                  );

                  // Add widget for preview
                  decorations.push(
                    Decoration.widget(to, () => {
                      const container = document.createElement("div");
                      container.className = "url-preview-container";
                      container.setAttribute("data-url", url);

                      // Create preview for both regular URLs and node URLs
                      extension.createUrlPreview(url, container);

                      const urlNode = nodeIdFromUrl(url);
                      if (urlNode && onUrlDetected) {
                        onUrlDetected(urlNode);
                      }

                      return container;
                    })
                  );
                }
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
          handlePaste: (view, event) => {
            if (!onUrlDetected) {
              return false;
            }

            const text = event.clipboardData?.getData("text/plain");
            if (!text) {
              return false;
            }

            const urls = text.match(URL_REGEX);
            if (urls) {
              urls.forEach((url) => {
                const node = nodeIdFromUrl(url);
                const isUrlNode = isUrlCandidate(node);
                if (node) {
                  const { from } = view.state.selection;
                  const nodeId = isUrlNode ? node.url : node.node;
                  storage.pendingUrls.set(nodeId, {
                    url,
                    nodeId,
                    from,
                    to: from + url.length,
                  });
                }
                onUrlDetected(node);
              });
            }

            return false;
          },
        },
      }),
    ];
  },
});
