import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import type { NodeCandidate, UrlCandidate } from "@app/lib/connectors";
import { isUrlCandidate, nodeIdFromUrl } from "@app/lib/connectors";

type URLFormatOptions = {
  onUrlDetected?: (candidate: UrlCandidate | NodeCandidate) => void;
};

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

export const URLDetectionExtension = Extension.create<URLFormatOptions>({
  name: "urlDetection",

  addOptions() {
    return {
      onUrlDetected: undefined,
    };
  },

  addProseMirrorPlugins() {
    const { onUrlDetected } = this.options;
    const storage = this.editor.storage.URLStorage;

    return [
      new Plugin({
        key: new PluginKey("urlDetection"),
        props: {
          // Handle paste events to detect URLs
          handlePaste: (view, event) => {
            if (!onUrlDetected) {
              return false;
            }

            // Get pasted text
            const text = event.clipboardData?.getData("text/plain");
            if (!text) {
              return false;
            }

            // Check for URLs in pasted content
            const urls = text.match(URL_REGEX);
            if (urls) {
              // For each URL found, check if it has a node ID
              urls.forEach((url) => {
                const node = nodeIdFromUrl(url);
                const isUrlNode = isUrlCandidate(node);
                if (node) {
                  const { from } = view.state.selection;
                  const nodeId = isUrlNode
                    ? node.candidate.url
                    : node.candidate.node;
                  // Store URL position for later replacement
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

            // Return false to allow normal paste handling
            return false;
          },
        },
      }),
    ];
  },
});
