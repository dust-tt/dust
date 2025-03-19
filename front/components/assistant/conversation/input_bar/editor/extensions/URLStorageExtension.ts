import { Extension } from "@tiptap/core";

export type URLState = {
  url: string;
  nodeId: string;
  from: number;
  to: number;
};

export const URLStorageExtension = Extension.create({
  name: "URLStorage",

  addStorage() {
    return {
      pendingUrls: new Map<string, URLState>(),
    };
  },
});
