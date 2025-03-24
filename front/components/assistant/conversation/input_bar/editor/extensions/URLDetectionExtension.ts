import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

import type { CandidateProvenance } from "@app/lib/connectors";
import { nodeIdFromUrl } from "@app/lib/connectors";

type URLFormatOptions = {
  onUrlDetected?: (candidate: string | null, type: CandidateProvenance) => void;
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
                if (node.candidate) {
                  const { from } = view.state.selection;
                  // Store URL position for later replacement
                  storage.pendingUrls.set(node.candidate, {
                    url,
                    nodeId: node.candidate,
                    from,
                    to: from + url.length,
                    type: node.type,
                  });
                }
                onUrlDetected(node.candidate, node.type);
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
