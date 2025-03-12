import { Extension, markPasteRule } from "@tiptap/core";

type URLFormatOptions = {
  onUrlDetected?: (url: string) => void;
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
          // Call the callback with the detected URL
          if (this.options.onUrlDetected) {
            this.options.onUrlDetected(match[0]);
          }
          return {};
        },
      }),
    ];
  },
});
