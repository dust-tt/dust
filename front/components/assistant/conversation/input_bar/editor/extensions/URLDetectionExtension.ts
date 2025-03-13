import { Extension, markPasteRule } from "@tiptap/core";

import { nodeIdFromUrl } from "@app/lib/connectors";

type URLFormatOptions = {
  onUrlDetected?: (url: string, nodeId?: string | null) => void;
};

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

export const URLDetectionExtension = Extension.create<URLFormatOptions>({
  name: "urlDetection",

  addOptions() {
    return {
      onUrlDetected: undefined,
    };
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: URL_REGEX,
        type: this.editor.schema.marks.bold,
        // Use getAttributes to trigger the callback
        getAttributes: (match) => {
          const url = match[0];
          const nodeId = nodeIdFromUrl(url);

          // Call the callback with the URL and extracted nodeId
          if (this.options.onUrlDetected) {
            this.options.onUrlDetected(url, nodeId);
          }
          return {};
        },
      }),
    ];
  },
});
