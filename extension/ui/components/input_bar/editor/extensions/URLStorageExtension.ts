import { Extension } from "@tiptap/core";

export type URLState = {
  url: string;
  nodeId: string;
  from: number;
  to: number;
};

declare module "@tiptap/core" {
  interface Storage {
    URLStorage: {
      pendingUrls: Map<string, URLState>;
    };
  }
}
export const URLStorageExtension = Extension.create({
  name: "URLStorage",

  addStorage() {
    return {
      pendingUrls: new Map<string, URLState>(),
    };
  },
});
