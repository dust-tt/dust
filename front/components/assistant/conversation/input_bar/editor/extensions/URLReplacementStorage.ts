import { Extension } from "@tiptap/core";

export type PendingReplacement = {
  url: string;
  position: number;
  nodeId: string;
};

export const URLReplacementStorage = Extension.create({
  name: "urlReplacementStorage",

  addStorage() {
    return {
      pendingReplacements: [] as PendingReplacement[],

      addReplacement(url: string, nodeId: string, position: number) {
        this.pendingReplacements.push({ url, nodeId, position });
      },

      getReplacements() {
        return this.pendingReplacements as PendingReplacement[];
      },

      clearReplacements() {
        this.pendingReplacements = [];
      },

      setCurrentNodeId(nodeId: string) {
        this.currentNodeId = nodeId;
      },

      currentNodeId: null as string | null,
    };
  },
});
