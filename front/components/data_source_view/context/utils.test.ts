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
        in: ["root.a"],
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
  });

  describe("removeNodeFromTree", () => {
    it("should add node to notIn when removing", () => {
      const tree = {
        in: [],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, ["root", "a"]);
      expect(result).toEqual({
        in: [],
        notIn: ["root.a"],
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
        notIn: ["root.a"],
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

    it("should remove specific paths while keeping broader ones", () => {
      const tree = {
        in: ["root", "root.a.b"],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, ["root", "a"]);
      expect(result).toEqual({
        in: ["root"],
        notIn: ["root.a"],
      });
    });

    it("should remove child paths when removing parent", () => {
      const tree = {
        in: ["root.a", "root.a.b", "root.a.c", "root.b"],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, ["root", "a"]);
      expect(result).toEqual({
        in: ["root.b"],
        notIn: ["root.a"],
      });
    });

    it("should handle removing path with multiple children", () => {
      const tree = {
        in: ["root", "root.a.b.c", "root.a.b.d", "root.a.e"],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, ["root", "a", "b"]);
      expect(result).toEqual({
        in: ["root", "root.a.e"],
        notIn: ["root.a.b"],
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
  });
});
