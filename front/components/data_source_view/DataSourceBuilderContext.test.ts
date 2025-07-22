import { describe, expect, it } from "vitest";

import {
  addNodeToTree,
  isNodeSelected,
  removeNodeFromTree,
  replaceDotsWithChilds,
} from "./DataSourceBuilderContext";

describe("DataSourceBuilder utilities", () => {
  describe("replaceDotsWithChilds", () => {
    it("should replace dots with .childs.", () => {
      expect(replaceDotsWithChilds("root.a.b")).toBe("root.childs.a.childs.b");
      expect(replaceDotsWithChilds("single")).toBe("single");
    });
  });

  describe("addNodeToTree", () => {
    it("should add a node to an empty tree", () => {
      const result = addNodeToTree({}, ["root", "a"]);
      expect(result).toEqual({
        root: {
          childs: {
            a: {},
          },
        },
      });
    });

    it("should add a nested node", () => {
      const tree = {
        root: {
          childs: {
            a: {},
          },
        },
      };
      const result = addNodeToTree(tree, ["root", "a", "b"]);
      expect(result).toEqual({
        root: {
          childs: {
            a: {
              childs: {
                b: {},
              },
            },
          },
        },
      });
    });

    it("should remove node from excludes when adding it", () => {
      const tree = {
        root: {
          excludes: ["a"],
        },
      };
      const result = addNodeToTree(tree, ["root", "a"]);
      expect(result).toEqual({
        root: {
          excludes: [],
        },
      });
    });
  });

  describe("removeNodeFromTree", () => {
    it("should remove a leaf node", () => {
      const tree = {
        root: {
          childs: {
            a: {
              childs: {
                b: {},
              },
            },
          },
        },
      };
      const result = removeNodeFromTree(tree, ["root", "a", "b"]);
      expect(result).toEqual({
        root: {
          childs: {},
        },
      });
    });

    it("should add to excludes when removing non-existent node", () => {
      const tree = {};
      const result = removeNodeFromTree(tree, ["root", "a"]);
      expect(result).toEqual({
        root: {
          excludes: ["a"],
        },
      });
    });

    it("should cleanup empty nodes after removal", () => {
      const tree = {
        root: {
          childs: {
            a: {
              childs: {
                b: {},
              },
            },
          },
        },
      };
      const result = removeNodeFromTree(tree, ["root", "a", "b"]);
      expect(result).toEqual({
        root: {
          childs: {},
        },
      });
    });
  });

  describe("isNodeSelected", () => {
    it("should return true for explicitly selected node", () => {
      const tree = {
        root: {
          childs: {
            a: {},
          },
        },
      };
      expect(isNodeSelected(tree, ["root", "a"])).toBe(true);
    });

    it("should return false for excluded node", () => {
      const tree = {
        root: {
          excludes: ["a"],
        },
      };
      expect(isNodeSelected(tree, ["root", "a"])).toBe(false);
    });

    it("should return true for parent with no excludes and no childs", () => {
      const tree = {
        root: {
          excludes: [],
          childs: {},
        },
      };
      expect(isNodeSelected(tree, ["root", "a"])).toBe(true);
    });

    it("should handle deeply nested paths", () => {
      const tree = {
        root: {
          childs: {
            a: {
              childs: {
                b: {
                  childs: {
                    c: {},
                  },
                },
              },
            },
          },
        },
      };
      expect(isNodeSelected(tree, ["root", "a", "b", "c"])).toBe(true);
    });
  });
});
