import { describe, expect, it } from "vitest";

import {
  addNodeToTree,
  isNodeSelected,
  removeNodeFromTree,
} from "@app/components/data_source_view/context/utils";

describe("DataSourceBuilder utilities", () => {
  describe("addNodeToTree", () => {
    it("should add a node to an empty tree", () => {
      const result = addNodeToTree({ in: [], notIn: [] }, ["root", "a"]);
      expect(result).toEqual({
        in: ["root.a"],
        notIn: [],
      });
    });

    it("should remove node from notIn when adding it", () => {
      const tree = {
        in: [],
        notIn: ["root.a"],
      };
      const result = addNodeToTree(tree, ["root", "a"]);
      expect(result).toEqual({
        in: [],
        notIn: [],
      });
    });

    it("should not duplicate paths in in array", () => {
      const tree = {
        in: ["root.a"],
        notIn: [],
      };
      const result = addNodeToTree(tree, ["root", "a"]);
      expect(result).toEqual({
        in: ["root.a"],
        notIn: [],
      });
    });

    it("should block partial path additions when parent is already selected", () => {
      const tree = {
        in: ["root"],
        notIn: [],
      };
      const result = addNodeToTree(tree, ["root", "a", "b"]);
      expect(result).toEqual({
        in: ["root"],
        notIn: [],
      });
    });

    it("should add a nested path without removing the exluded parent", () => {
      const tree = {
        in: [],
        notIn: ["a"],
      };

      const result = addNodeToTree(tree, ["a", "b", "c"]);
      expect(result).toEqual({
        in: ["a.b.c"],
        notIn: ["a"],
      });
    });

    it("should add a nested path that is notIn, when its parent is in", () => {
      const tree = {
        in: ["root.a"],
        notIn: ["root.a.b.c"],
      };

      const result = addNodeToTree(tree, ["root", "a", "b", "c"]);
      expect(result).toEqual({
        in: ["root.a"],
        notIn: [],
      });
    });

    it("should handle adding multiple levels deep when grandparent is included", () => {
      const tree = {
        in: ["root"],
        notIn: [],
      };
      const result = addNodeToTree(tree, ["root", "a", "b", "c", "d"]);
      expect(result).toEqual({
        in: ["root"],
        notIn: [],
      });
    });

    it("should add sibling paths independently", () => {
      const tree = {
        in: ["root.a"],
        notIn: [],
      };
      const result = addNodeToTree(tree, ["root", "b"]);
      expect(result).toEqual({
        in: ["root.a", "root.b"],
        notIn: [],
      });
    });

    it("should handle adding root level paths", () => {
      const tree = {
        in: [],
        notIn: ["other"],
      };
      const result = addNodeToTree(tree, ["root"]);
      expect(result).toEqual({
        in: ["root"],
        notIn: ["other"],
      });
    });

    it("should remove multiple child exclusions when adding parent", () => {
      const tree = {
        in: [],
        notIn: ["root.a.b", "root.a.c", "root.a.d"],
      };
      const result = addNodeToTree(tree, ["root", "a"]);
      expect(result).toEqual({
        in: ["root.a"],
        notIn: [],
      });
    });

    it("should handle adding when parent is in notIn but has excluded children", () => {
      const tree = {
        in: ["root.b"],
        notIn: ["root.a", "root.a.x"],
      };
      const result = addNodeToTree(tree, ["root", "a", "y"]);
      expect(result).toEqual({
        in: ["root.b", "root.a.y"],
        notIn: ["root.a", "root.a.x"],
      });
    });

    it("should handle complex mixed scenario with multiple branches", () => {
      const tree = {
        in: ["root.a", "root.c"],
        notIn: ["root.b", "root.d.x"],
      };
      const result = addNodeToTree(tree, ["root", "d"]);
      expect(result).toEqual({
        in: ["root.a", "root.c", "root.d"],
        notIn: ["root.b"],
      });
    });

    it("should handle single character paths", () => {
      const tree = {
        in: [],
        notIn: ["a"],
      };
      const result = addNodeToTree(tree, ["a"]);
      expect(result).toEqual({
        in: [],
        notIn: [],
      });
    });

    it("should preserve unrelated exclusions when adding", () => {
      const tree = {
        in: ["docs"],
        notIn: ["temp.cache", "logs.old"],
      };
      const result = addNodeToTree(tree, ["src", "main"]);
      expect(result).toEqual({
        in: ["docs", "src.main"],
        notIn: ["temp.cache", "logs.old"],
      });
    });
  });

  describe("removeNodeFromTree", () => {
    it("should not removing anything if the notIn is empty", () => {
      const tree = {
        in: [],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, ["root", "a"]);
      expect(result).toEqual({
        in: [],
        notIn: [],
      });
    });

    it("should remove node from in when excluding it", () => {
      const tree = {
        in: ["root.a"],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, ["root", "a"]);
      expect(result).toEqual({
        in: [],
        notIn: [],
      });
    });

    it("should not duplicate paths in notIn array", () => {
      const tree = {
        in: [],
        notIn: ["root.a"],
      };
      const result = removeNodeFromTree(tree, ["root", "a"]);
      expect(result).toEqual({
        in: [],
        notIn: ["root.a"],
      });
    });

    it("should handle removing nested paths", () => {
      const tree = {
        in: ["root.a.b"],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, ["root", "a", "b", "c"]);
      expect(result).toEqual({
        in: ["root.a.b"],
        notIn: ["root.a.b.c"],
      });
    });

    it("should remove child paths when removing parent", () => {
      const tree = {
        in: ["root.a.b", "root.a.c", "root.b"],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, ["root", "a"]);
      expect(result).toEqual({
        in: ["root.b"],
        notIn: [],
      });
    });

    it("should not affect unrelated paths", () => {
      const tree = {
        in: ["root", "other.a.b", "root.x.y"],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, ["root", "a"]);
      expect(result).toEqual({
        in: ["root", "other.a.b", "root.x.y"],
        notIn: ["root.a"],
      });
    });

    it("should remove child notIn", () => {
      const tree = {
        in: ["root.a"],
        notIn: ["root.b.c"],
      };

      const result = removeNodeFromTree(tree, ["root", "b"]);
      expect(result).toEqual({
        in: ["root.a"],
        notIn: ["root.b"],
      });
    });

    it("should handle removing deeply nested paths with multiple levels", () => {
      const tree = {
        in: ["root.a.b.c.d.e"],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, ["root", "a", "b"]);
      expect(result).toEqual({
        in: [],
        notIn: [],
      });
    });

    it("should remove multiple siblings when removing their parent", () => {
      const tree = {
        in: ["root.a.x", "root.a.y", "root.a.z", "root.b"],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, ["root", "a"]);
      expect(result).toEqual({
        in: ["root.b"],
        notIn: [],
      });
    });

    it("should handle removing when there are multiple exclusions at different levels", () => {
      const tree = {
        in: ["root"],
        notIn: ["root.a.x", "root.b.y", "root.c"],
      };
      const result = removeNodeFromTree(tree, ["root", "a"]);
      expect(result).toEqual({
        in: ["root"],
        notIn: ["root.b.y", "root.c", "root.a"],
      });
    });

    it("should handle removing root path with many children", () => {
      const tree = {
        in: ["root", "other.x"],
        notIn: ["root.excluded"],
      };
      const result = removeNodeFromTree(tree, ["root"]);
      expect(result).toEqual({
        in: ["other.x"],
        notIn: [],
      });
    });

    it("should handle removing when path has both included and excluded children", () => {
      const tree = {
        in: ["root.a.included1", "root.a.included2"],
        notIn: ["root.a.excluded1", "root.a.excluded2"],
      };
      const result = removeNodeFromTree(tree, ["root", "a"]);
      expect(result).toEqual({
        in: [],
        notIn: ["root.a"],
      });
    });

    it("should preserve complex exclusion hierarchy when removing unrelated path", () => {
      const tree = {
        in: ["root", "other.branch"],
        notIn: ["root.a.b.c", "root.x.y", "root.z"],
      };
      const result = removeNodeFromTree(tree, ["other", "branch"]);
      expect(result).toEqual({
        in: ["root"],
        notIn: ["root.a.b.c", "root.x.y", "root.z"],
      });
    });

    it("should consolidate exclusions when removing parent of multiple excluded children", () => {
      const tree = {
        in: ["root"],
        notIn: ["root.a.x.1", "root.a.x.2", "root.a.y.1", "root.a.y.2"],
      };
      const result = removeNodeFromTree(tree, ["root", "a", "x"]);
      expect(result).toEqual({
        in: ["root"],
        notIn: ["root.a.y.1", "root.a.y.2", "root.a.x"],
      });
    });

    it("should handle removing path that would create redundant exclusion", () => {
      const tree = {
        in: ["root"],
        notIn: ["root.a"],
      };
      const result = removeNodeFromTree(tree, ["root", "a", "b"]);
      expect(result).toEqual({
        in: ["root"],
        notIn: ["root.a"],
      });
    });
  });

  describe("isNodeSelected", () => {
    it("should return true for explicitly included node", () => {
      const tree = {
        in: ["root.a"],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["root", "a"])).toBe(true);
    });

    it("should return false for excluded node", () => {
      const tree = {
        in: [],
        notIn: ["root.a"],
      };
      expect(isNodeSelected(tree, ["root", "a"])).toBe(false);
    });

    it("should return true for child of included parent", () => {
      const tree = {
        in: ["root"],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["root", "a"])).toBe(true);
      expect(isNodeSelected(tree, ["root", "a", "b"])).toBe(true);
    });

    it("should return false for child of excluded parent", () => {
      const tree = {
        in: [],
        notIn: ["root"],
      };
      expect(isNodeSelected(tree, ["root", "a"])).toBe(false);
    });

    it("should handle partial path matches", () => {
      const tree = {
        in: ["root.a"],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["root", "a", "b"])).toBe(true);
      expect(isNodeSelected(tree, ["root", "b"])).toBe(false);
    });

    it("should prioritize notIn over in for exact matches", () => {
      const tree = {
        in: ["root"],
        notIn: ["root.a"],
      };
      expect(isNodeSelected(tree, ["root", "a"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "b"])).toBe(true);
    });

    it("should handle deeply nested paths", () => {
      const tree = {
        in: ["a.b.c"],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["a", "b", "c"])).toBe(true);
      expect(isNodeSelected(tree, ["a", "b", "c", "d"])).toBe(true);
    });

    it("should handle complex inclusion/exclusion scenarios", () => {
      const tree = {
        in: ["root"],
        notIn: ["root.a", "root.b.c"],
      };
      expect(isNodeSelected(tree, ["root"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "b"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "b", "c"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "b", "d"])).toBe(true);
    });

    it("should return 'partial' when parent has mixed children", () => {
      const tree = {
        in: ["root.a", "root.c"],
        notIn: ["root.b"],
      };
      expect(isNodeSelected(tree, ["root"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a"])).toBe(true);
      expect(isNodeSelected(tree, ["root", "b"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "c"])).toBe(true);
    });

    it("should return 'partial' when included parent has excluded children", () => {
      const tree = {
        in: ["root"],
        notIn: ["root.a"],
      };
      expect(isNodeSelected(tree, ["root"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "b"])).toBe(true);
    });

    it("should return true when all children are included", () => {
      const tree = {
        in: ["root"],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["root"])).toBe(true);
      expect(isNodeSelected(tree, ["root", "a"])).toBe(true);
      expect(isNodeSelected(tree, ["root", "b"])).toBe(true);
    });

    it("should return 'partial' for parent with some included children", () => {
      const tree = {
        in: ["root.a.b"],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["root"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a", "b"])).toBe(true);
      expect(isNodeSelected(tree, ["root", "a", "c"])).toBe(false);
    });

    it("should return false for paths not matching any included pattern", () => {
      const tree = {
        in: ["root.a"],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["other"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "b"])).toBe(false);
    });

    it("should handle empty tree correctly", () => {
      const tree = {
        in: [],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["root"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "a"])).toBe(false);
    });

    it("should handle tree with only exclusions", () => {
      const tree = {
        in: [],
        notIn: ["root.a", "docs.temp"],
      };
      expect(isNodeSelected(tree, ["root"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "a"])).toBe(false);
      expect(isNodeSelected(tree, ["docs", "temp"])).toBe(false);
      expect(isNodeSelected(tree, ["other"])).toBe(false);
    });

    it("should handle multiple root level paths", () => {
      const tree = {
        in: ["root", "docs", "src"],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["root"])).toBe(true);
      expect(isNodeSelected(tree, ["docs"])).toBe(true);
      expect(isNodeSelected(tree, ["src"])).toBe(true);
      expect(isNodeSelected(tree, ["other"])).toBe(false);
    });

    it("should handle deeply nested exclusions", () => {
      const tree = {
        in: ["root"],
        notIn: ["root.a.b.c.d.e"],
      };
      expect(isNodeSelected(tree, ["root"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a", "b"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a", "b", "c"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a", "b", "c", "d"])).toBe(
        "partial"
      );
      expect(isNodeSelected(tree, ["root", "a", "b", "c", "d", "e"])).toBe(
        false
      );
      expect(isNodeSelected(tree, ["root", "a", "b", "c", "d", "f"])).toBe(
        true
      );
    });

    it("should handle multiple siblings with mixed states", () => {
      const tree = {
        in: ["root.a", "root.c"],
        notIn: ["root.b", "root.d"],
      };
      expect(isNodeSelected(tree, ["root"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a"])).toBe(true);
      expect(isNodeSelected(tree, ["root", "b"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "c"])).toBe(true);
      expect(isNodeSelected(tree, ["root", "d"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "e"])).toBe(false);
    });

    it("should handle cross-branch scenarios", () => {
      const tree = {
        in: ["docs.api", "src.components"],
        notIn: ["docs.temp", "src.tests"],
      };
      expect(isNodeSelected(tree, ["docs"])).toBe("partial");
      expect(isNodeSelected(tree, ["docs", "api"])).toBe(true);
      expect(isNodeSelected(tree, ["docs", "temp"])).toBe(false);
      expect(isNodeSelected(tree, ["docs", "other"])).toBe(false);
      expect(isNodeSelected(tree, ["src"])).toBe("partial");
      expect(isNodeSelected(tree, ["src", "components"])).toBe(true);
      expect(isNodeSelected(tree, ["src", "tests"])).toBe(false);
      expect(isNodeSelected(tree, ["src", "utils"])).toBe(false);
    });

    it("should handle complex nested inclusion with partial exclusions", () => {
      const tree = {
        in: ["root", "other.branch"],
        notIn: [
          "root.excluded.deeply.nested",
          "root.temp",
          "other.branch.cache",
        ],
      };
      expect(isNodeSelected(tree, ["root"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "excluded"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "excluded", "deeply"])).toBe(
        "partial"
      );
      expect(
        isNodeSelected(tree, ["root", "excluded", "deeply", "nested"])
      ).toBe(false);
      expect(isNodeSelected(tree, ["root", "excluded", "other"])).toBe(true);
      expect(isNodeSelected(tree, ["root", "temp"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "allowed"])).toBe(true);
      expect(isNodeSelected(tree, ["other"])).toBe("partial");
      expect(isNodeSelected(tree, ["other", "branch"])).toBe("partial");
      expect(isNodeSelected(tree, ["other", "branch", "cache"])).toBe(false);
      expect(isNodeSelected(tree, ["other", "branch", "files"])).toBe(true);
    });

    it("should handle edge case with parent and child both in arrays", () => {
      const tree = {
        in: ["root", "root.a"],
        notIn: ["root.b"],
      };
      expect(isNodeSelected(tree, ["root"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a"])).toBe(true);
      expect(isNodeSelected(tree, ["root", "b"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "c"])).toBe(true);
    });

    it("should handle conflicting parent-child relationships", () => {
      const tree = {
        in: ["root.a.b"],
        notIn: ["root.a"],
      };
      expect(isNodeSelected(tree, ["root"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "a", "b"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "a", "c"])).toBe(false);
    });

    it("should handle multiple levels of partial selection", () => {
      const tree = {
        in: ["a.b.c.d", "a.x.y.z"],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["a"])).toBe("partial");
      expect(isNodeSelected(tree, ["a", "b"])).toBe("partial");
      expect(isNodeSelected(tree, ["a", "b", "c"])).toBe("partial");
      expect(isNodeSelected(tree, ["a", "b", "c", "d"])).toBe(true);
      expect(isNodeSelected(tree, ["a", "b", "c", "e"])).toBe(false);
      expect(isNodeSelected(tree, ["a", "x"])).toBe("partial");
      expect(isNodeSelected(tree, ["a", "x", "y"])).toBe("partial");
      expect(isNodeSelected(tree, ["a", "x", "y", "z"])).toBe(true);
      expect(isNodeSelected(tree, ["a", "m"])).toBe(false);
    });
  });
});
