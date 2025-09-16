import { describe, expect, it } from "vitest";

import type {
  DataSourceBuilderTreeItemType,
  DataSourceBuilderTreeType,
} from "@app/components/data_source_view/context/types";
import {
  addNodeToTree,
  isNodeSelected,
  removeNodeFromTree,
} from "@app/components/data_source_view/context/utils";

// Helper function to create tree items
const createTreeItem = (
  path: string,
  name?: string
): DataSourceBuilderTreeItemType => ({
  path,
  name: name || path.split("/").pop() || path,
  type: "root",
});

describe("DataSourceBuilder utilities", () => {
  describe("addNodeToTree", () => {
    it("should add a node to an empty tree", () => {
      const result = addNodeToTree(
        { in: [], notIn: [] },
        { path: "root/a", name: "a", type: "root" }
      );
      expect(result).toEqual({
        in: [{ path: "root/a", name: "a", type: "root" }],
        notIn: [],
      });
    });

    it("should remove node from notIn when adding it", () => {
      const tree = {
        in: [],
        notIn: [createTreeItem("root/a")],
      };
      const result = addNodeToTree(tree, {
        path: "root/a",
        name: "a",
        type: "root",
      });
      expect(result).toEqual({
        in: [],
        notIn: [],
      });
    });

    it("should not duplicate paths in in array", () => {
      const tree = {
        in: [createTreeItem("root/a")],
        notIn: [],
      };
      const result = addNodeToTree(tree, {
        path: "root/a",
        name: "a",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("root/a")],
        notIn: [],
      });
    });

    it("should block partial path additions when parent is already selected", () => {
      const tree = {
        in: [createTreeItem("root")],
        notIn: [],
      };
      const result = addNodeToTree(tree, {
        path: "root/a/b",
        name: "b",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("root")],
        notIn: [],
      });
    });

    it("should add a nested path without removing the excluded parent", () => {
      const tree = {
        in: [],
        notIn: [createTreeItem("a")],
      };

      const result = addNodeToTree(tree, {
        path: "a/b/c",
        name: "c",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("a/b/c", "c")],
        notIn: [createTreeItem("a")],
      });
    });

    it("should add a nested path that is notIn, when its parent is in", () => {
      const tree = {
        in: [createTreeItem("root/a")],
        notIn: [createTreeItem("root/a/b/c")],
      };

      const result = addNodeToTree(tree, {
        path: "root/a/b/c",
        name: "c",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("root/a")],
        notIn: [],
      });
    });

    it("should handle adding multiple levels deep when grandparent is included", () => {
      const tree = {
        in: [createTreeItem("root")],
        notIn: [],
      };
      const result = addNodeToTree(tree, {
        path: "root/a/b/c/d",
        name: "d",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("root")],
        notIn: [],
      });
    });

    it("should add sibling paths independently", () => {
      const tree = {
        in: [createTreeItem("root/a")],
        notIn: [],
      };
      const result = addNodeToTree(tree, {
        path: "root/b",
        name: "b",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("root/a"), createTreeItem("root/b", "b")],
        notIn: [],
      });
    });

    it("should handle adding root level paths", () => {
      const tree = {
        in: [],
        notIn: [createTreeItem("other")],
      };
      const result = addNodeToTree(tree, {
        path: "root",
        name: "root",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("root", "root")],
        notIn: [createTreeItem("other")],
      });
    });

    it("should remove multiple child exclusions when adding parent", () => {
      const tree = {
        in: [],
        notIn: [
          createTreeItem("root/a/b"),
          createTreeItem("root/a/c"),
          createTreeItem("root/a/d"),
        ],
      };
      const result = addNodeToTree(tree, {
        path: "root/a",
        name: "a",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("root/a", "a")],
        notIn: [],
      });
    });

    it("should handle adding when parent is in notIn but has excluded children", () => {
      const tree = {
        in: [createTreeItem("root/b")],
        notIn: [createTreeItem("root/a"), createTreeItem("root/a/x")],
      };
      const result = addNodeToTree(tree, {
        path: "root/a/y",
        name: "y",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("root/b"), createTreeItem("root/a/y", "y")],
        notIn: [createTreeItem("root/a"), createTreeItem("root/a/x")],
      });
    });

    it("should handle complex mixed scenario with multiple branches", () => {
      const tree = {
        in: [createTreeItem("root/a"), createTreeItem("root/c")],
        notIn: [createTreeItem("root/b"), createTreeItem("root/d/x")],
      };
      const result = addNodeToTree(tree, {
        path: "root/d",
        name: "d",
        type: "root",
      });
      expect(result).toEqual({
        in: [
          createTreeItem("root/a"),
          createTreeItem("root/c"),
          createTreeItem("root/d", "d"),
        ],
        notIn: [createTreeItem("root/b")],
      });
    });

    it("should handle single character paths", () => {
      const tree = {
        in: [],
        notIn: [createTreeItem("a")],
      };
      const result = addNodeToTree(tree, {
        path: "a",
        name: "a",
        type: "root",
      });
      expect(result).toEqual({
        in: [],
        notIn: [],
      });
    });

    it("should preserve unrelated exclusions when adding", () => {
      const tree = {
        in: [createTreeItem("docs")],
        notIn: [createTreeItem("temp/cache"), createTreeItem("logs/old")],
      };
      const result = addNodeToTree(tree, {
        path: "src/main",
        name: "main",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("docs"), createTreeItem("src/main", "main")],
        notIn: [createTreeItem("temp/cache"), createTreeItem("logs/old")],
      });
    });

    it("should remove child in when adding its parent", () => {
      const tree = {
        in: [createTreeItem("root/a/b", "a.b")],
        notIn: [],
      };

      const result = addNodeToTree(tree, {
        path: "root/a",
        name: "a",
        type: "root",
      });

      expect(result).toEqual({
        in: [createTreeItem("root/a", "a")],
        notIn: [],
      });
    });

    it("should handle adding to 'select all with exclusions' state correctly", () => {
      // Scenario: User selected all, excluded "Syncing", now wants to add another item from same parent
      const tree = {
        in: [],
        notIn: [
          createTreeItem("root/Company Data/Connected Data/Notion/Syncing"),
        ],
      };

      // Adding "Design" should just remove it from exclusions (it's already implicitly selected)
      const result = addNodeToTree(tree, {
        path: "root/Company Data/Connected Data/Notion/Design",
        name: "Design",
        type: "root",
      });

      expect(result).toEqual({
        in: [], // Should remain empty (still in "select all" mode)
        notIn: [
          createTreeItem("root/Company Data/Connected Data/Notion/Syncing"),
        ], // Syncing still excluded
      });
    });

    it("should handle adding unrelated item to 'select all with exclusions' state", () => {
      // Scenario: User selected all from Notion, excluded "Syncing", now wants to add item from different data source
      const tree = {
        in: [],
        notIn: [
          createTreeItem("root/Company Data/Connected Data/Notion/Syncing"),
        ],
      };

      // Adding item from different data source should add to inclusions
      const result = addNodeToTree(tree, {
        path: "root/Company Data/Connected Data/Slack/General",
        name: "General",
        type: "root",
      });

      expect(result).toEqual({
        in: [
          createTreeItem(
            "root/Company Data/Connected Data/Slack/General",
            "General"
          ),
        ],
        notIn: [
          createTreeItem("root/Company Data/Connected Data/Notion/Syncing"),
        ],
      });
    });

    it("should handle user's exact scenario: select entire data source, exclude file, then re-add file", () => {
      // Initial: User selected entire Notion data source
      const initialTree = {
        in: [createTreeItem("root/Company Data/Connected Data/Notion")],
        notIn: [],
      };

      // User unchecks one specific file (e.g., Design.md)
      const treeWithExclusion = removeNodeFromTree(initialTree, {
        path: "root/Company Data/Connected Data/Notion/Design.md",
        name: "Design.md",
        type: "root",
      });

      // Should still have the data source selected but with file excluded
      expect(treeWithExclusion).toEqual({
        in: [createTreeItem("root/Company Data/Connected Data/Notion")],
        notIn: [
          createTreeItem(
            "root/Company Data/Connected Data/Notion/Design.md",
            "Design.md"
          ),
        ],
      });

      // User re-selects the excluded file (should remove from exclusions, keep parent selection)
      const finalTree = addNodeToTree(treeWithExclusion, {
        path: "root/Company Data/Connected Data/Notion/Design.md",
        name: "Design.md",
        type: "root",
      });

      // Should be back to original state: entire data source selected, no exclusions
      expect(finalTree).toEqual({
        in: [createTreeItem("root/Company Data/Connected Data/Notion")],
        notIn: [], // Back to no exclusions
      });

      // Double-check: what if user tries to add multiple files back?
      const treeWithMultipleExclusions = {
        in: [createTreeItem("root/Company Data/Connected Data/Notion")],
        notIn: [
          createTreeItem(
            "root/Company Data/Connected Data/Notion/Design.md",
            "Design.md"
          ),
          createTreeItem(
            "root/Company Data/Connected Data/Notion/Syncing.md",
            "Syncing.md"
          ),
        ],
      };

      // Re-add first file
      const afterFirstAdd = addNodeToTree(treeWithMultipleExclusions, {
        path: "root/Company Data/Connected Data/Notion/Design.md",
        name: "Design.md",
        type: "root",
      });

      expect(afterFirstAdd).toEqual({
        in: [createTreeItem("root/Company Data/Connected Data/Notion")],
        notIn: [
          createTreeItem(
            "root/Company Data/Connected Data/Notion/Syncing.md",
            "Syncing.md"
          ),
        ],
      });

      // Re-add second file
      const afterSecondAdd = addNodeToTree(afterFirstAdd, {
        path: "root/Company Data/Connected Data/Notion/Syncing.md",
        name: "Syncing.md",
        type: "root",
      });

      expect(afterSecondAdd).toEqual({
        in: [createTreeItem("root/Company Data/Connected Data/Notion")],
        notIn: [], // All exclusions removed
      });
    });

  });

  describe("removeNodeFromTree", () => {
    it("should not removing anything if the notIn is empty", () => {
      const tree = {
        in: [],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, {
        path: "root/a",
        name: "a",
        type: "root",
      });
      expect(result).toEqual({
        in: [],
        notIn: [],
      });
    });

    it("should remove node from in when excluding it", () => {
      const tree = {
        in: [createTreeItem("root/a")],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, {
        path: "root/a",
        name: "a",
        type: "root",
      });
      expect(result).toEqual({
        in: [],
        notIn: [],
      });
    });

    it("should not duplicate paths in notIn array", () => {
      const tree = {
        in: [],
        notIn: [createTreeItem("root/a")],
      };
      const result = removeNodeFromTree(tree, {
        path: "root/a",
        name: "a",
        type: "root",
      });
      expect(result).toEqual({
        in: [],
        notIn: [createTreeItem("root/a")],
      });
    });

    it("should handle removing nested paths", () => {
      const tree = {
        in: [createTreeItem("root/a/b")],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, {
        path: "root/a/b/c",
        name: "c",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("root/a/b")],
        notIn: [createTreeItem("root/a/b/c", "c")],
      });
    });

    it("should remove child paths when removing parent", () => {
      const tree = {
        in: [
          createTreeItem("root/a/b"),
          createTreeItem("root/a/c"),
          createTreeItem("root/b"),
        ],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, {
        path: "root/a",
        name: "a",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("root/b")],
        notIn: [],
      });
    });

    it("should not affect unrelated paths", () => {
      const tree = {
        in: [
          createTreeItem("root"),
          createTreeItem("other/a/b"),
          createTreeItem("root/x/y"),
        ],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, {
        path: "root/a",
        name: "a",
        type: "root",
      });
      expect(result).toEqual({
        in: [
          createTreeItem("root"),
          createTreeItem("other/a/b"),
          createTreeItem("root/x/y"),
        ],
        notIn: [createTreeItem("root/a", "a")],
      });
    });

    it("should remove child notIn", () => {
      const tree = {
        in: [createTreeItem("root/a")],
        notIn: [createTreeItem("root/b/c")],
      };

      const result = removeNodeFromTree(tree, {
        path: "root/b",
        name: "b",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("root/a")],
        notIn: [createTreeItem("root/b", "b")],
      });
    });

    it("should handle removing deeply nested paths with multiple levels", () => {
      const tree = {
        in: [createTreeItem("root/a/b/c/d/e")],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, {
        path: "root/a/b",
        name: "b",
        type: "root",
      });
      expect(result).toEqual({
        in: [],
        notIn: [],
      });
    });

    it("should remove multiple siblings when removing their parent", () => {
      const tree = {
        in: [
          createTreeItem("root/a/x"),
          createTreeItem("root/a/y"),
          createTreeItem("root/a/z"),
          createTreeItem("root/b"),
        ],
        notIn: [],
      };
      const result = removeNodeFromTree(tree, {
        path: "root/a",
        name: "a",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("root/b")],
        notIn: [],
      });
    });

    it("should handle removing when there are multiple exclusions at different levels", () => {
      const tree = {
        in: [createTreeItem("root")],
        notIn: [
          createTreeItem("root/a/x"),
          createTreeItem("root/b/y"),
          createTreeItem("root/c"),
        ],
      };
      const result = removeNodeFromTree(tree, {
        path: "root/a",
        name: "a",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("root")],
        notIn: [
          createTreeItem("root/b/y"),
          createTreeItem("root/c"),
          createTreeItem("root/a", "a"),
        ],
      });
    });

    it("should handle removing root path with many children", () => {
      const tree = {
        in: [createTreeItem("root"), createTreeItem("other/x")],
        notIn: [createTreeItem("root/excluded")],
      };
      const result = removeNodeFromTree(tree, {
        path: "root",
        name: "root",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("other/x")],
        notIn: [],
      });
    });

    it("should handle removing when path has both included and excluded children", () => {
      const tree = {
        in: [
          createTreeItem("root/a/included1"),
          createTreeItem("root/a/included2"),
        ],
        notIn: [
          createTreeItem("root/a/excluded1"),
          createTreeItem("root/a/excluded2"),
        ],
      };
      const result = removeNodeFromTree(tree, {
        path: "root/a",
        name: "a",
        type: "root",
      });
      expect(result).toEqual({
        in: [],
        notIn: [createTreeItem("root/a", "a")],
      });
    });

    it("should preserve complex exclusion hierarchy when removing unrelated path", () => {
      const tree = {
        in: [createTreeItem("root"), createTreeItem("other/branch")],
        notIn: [
          createTreeItem("root/a/b/c"),
          createTreeItem("root/x/y"),
          createTreeItem("root/z"),
        ],
      };
      const result = removeNodeFromTree(tree, {
        path: "other/branch",
        name: "branch",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("root")],
        notIn: [
          createTreeItem("root/a/b/c"),
          createTreeItem("root/x/y"),
          createTreeItem("root/z"),
        ],
      });
    });

    it("should consolidate exclusions when removing parent of multiple excluded children", () => {
      const tree = {
        in: [createTreeItem("root")],
        notIn: [
          createTreeItem("root/a/x/1"),
          createTreeItem("root/a/x/2"),
          createTreeItem("root/a/y/1"),
          createTreeItem("root/a/y/2"),
        ],
      };
      const result = removeNodeFromTree(tree, {
        path: "root/a/x",
        name: "x",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("root")],
        notIn: [
          createTreeItem("root/a/y/1"),
          createTreeItem("root/a/y/2"),
          createTreeItem("root/a/x", "x"),
        ],
      });
    });

    it("should handle removing path that would create redundant exclusion", () => {
      const tree = {
        in: [createTreeItem("root")],
        notIn: [createTreeItem("root/a")],
      };
      const result = removeNodeFromTree(tree, {
        path: "root/a/b",
        name: "b",
        type: "root",
      });
      expect(result).toEqual({
        in: [createTreeItem("root")],
        notIn: [createTreeItem("root/a")],
      });
    });

    it("should handle removing implicitly selected item in 'select all with exclusions' state", () => {
      // Scenario: User selected all from Notion, excluded "Syncing", now wants to uncheck "Design" (currently showing as checked)
      const tree = {
        in: [],
        notIn: [
          createTreeItem("root/Company Data/Connected Data/Notion/Syncing"),
        ],
      };

      // Removing "Design" should add it to exclusions (it was implicitly selected as sibling of excluded item)
      const result = removeNodeFromTree(tree, {
        path: "root/Company Data/Connected Data/Notion/Design",
        name: "Design",
        type: "root",
      });

      expect(result).toEqual({
        in: [],
        notIn: [
          createTreeItem("root/Company Data/Connected Data/Notion/Syncing"),
          createTreeItem(
            "root/Company Data/Connected Data/Notion/Design",
            "Design"
          ),
        ],
      });
    });
  });

  describe("isNodeSelected", () => {
    it("should return true for explicitly included node", () => {
      const tree = {
        in: [createTreeItem("root/a")],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["root", "a"])).toBe(true);
    });

    it("should return false for excluded node", () => {
      const tree = {
        in: [],
        notIn: [createTreeItem("root/a")],
      };
      expect(isNodeSelected(tree, ["root", "a"])).toBe(false);
    });

    it("should return true for child of included parent", () => {
      const tree = {
        in: [createTreeItem("root")],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["root", "a"])).toBe(true);
      expect(isNodeSelected(tree, ["root", "a", "b"])).toBe(true);
    });

    it("should return false for child of excluded parent", () => {
      const tree = {
        in: [],
        notIn: [createTreeItem("root")],
      };
      expect(isNodeSelected(tree, ["root", "a"])).toBe(false);
    });

    it("should handle partial path matches", () => {
      const tree = {
        in: [createTreeItem("root/a")],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["root", "a", "b"])).toBe(true);
      expect(isNodeSelected(tree, ["root", "b"])).toBe(false);
    });

    it("should prioritize notIn over in for exact matches", () => {
      const tree = {
        in: [createTreeItem("root")],
        notIn: [createTreeItem("root/a")],
      };
      expect(isNodeSelected(tree, ["root", "a"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "b"])).toBe(true);
    });

    it("should handle deeply nested paths", () => {
      const tree = {
        in: [createTreeItem("a/b/c")],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["a", "b", "c"])).toBe(true);
      expect(isNodeSelected(tree, ["a", "b", "c", "d"])).toBe(true);
    });

    it("should handle complex inclusion/exclusion scenarios", () => {
      const tree = {
        in: [createTreeItem("root")],
        notIn: [createTreeItem("root/a"), createTreeItem("root/b/c")],
      };
      expect(isNodeSelected(tree, ["root"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "b"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "b", "c"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "b", "d"])).toBe(true);
    });

    it("should return 'partial' when parent has mixed children", () => {
      const tree = {
        in: [createTreeItem("root/a"), createTreeItem("root/c")],
        notIn: [createTreeItem("root/b")],
      };
      expect(isNodeSelected(tree, ["root"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a"])).toBe(true);
      expect(isNodeSelected(tree, ["root", "b"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "c"])).toBe(true);
    });

    it("should return 'partial' when included parent has excluded children", () => {
      const tree = {
        in: [createTreeItem("root")],
        notIn: [createTreeItem("root/a")],
      };
      expect(isNodeSelected(tree, ["root"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a"])).toBe(false);
      expect(isNodeSelected(tree, ["root", "b"])).toBe(true);
    });

    it("should return true when all children are included", () => {
      const tree = {
        in: [createTreeItem("root")],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["root"])).toBe(true);
      expect(isNodeSelected(tree, ["root", "a"])).toBe(true);
      expect(isNodeSelected(tree, ["root", "b"])).toBe(true);
    });

    it("should return 'partial' for parent with some included children", () => {
      const tree = {
        in: [createTreeItem("root/a/b")],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["root"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a"])).toBe("partial");
      expect(isNodeSelected(tree, ["root", "a", "b"])).toBe(true);
      expect(isNodeSelected(tree, ["root", "a", "c"])).toBe(false);
    });

    it("should return false for paths not matching any included pattern", () => {
      const tree = {
        in: [createTreeItem("root/a")],
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

    it("should handle tree with only exclusions (select all with exclusions)", () => {
      const tree = {
        in: [],
        notIn: [createTreeItem("root/a"), createTreeItem("docs/temp")],
      };
      // In "select all with exclusions" scenario:
      expect(isNodeSelected(tree, ["root"])).toBe("partial"); // Has excluded child, should be partial
      expect(isNodeSelected(tree, ["root", "a"])).toBe(false); // Explicitly excluded
      expect(isNodeSelected(tree, ["root", "b"])).toBe(true); // Sibling of excluded item, should be selected
      expect(isNodeSelected(tree, ["docs"])).toBe("partial"); // Has excluded child, should be partial
      expect(isNodeSelected(tree, ["docs", "temp"])).toBe(false); // Explicitly excluded
      expect(isNodeSelected(tree, ["docs", "other"])).toBe(true); // Sibling of excluded item, should be selected
      expect(isNodeSelected(tree, ["other"])).toBe(false); // Not a sibling of any excluded item
    });

    it("should handle user scenario: select all then exclude only Syncing", () => {
      const tree = {
        in: [],
        notIn: [
          createTreeItem("root/Company Data/Connected Data/Notion/Syncing"),
        ],
      };
      // User selected all then excluded only "Syncing"
      expect(
        isNodeSelected(tree, [
          "root",
          "Company Data",
          "Connected Data",
          "Notion",
        ])
      ).toBe("partial"); // Parent with exclusion
      expect(
        isNodeSelected(tree, [
          "root",
          "Company Data",
          "Connected Data",
          "Notion",
          "Design",
        ])
      ).toBe(true); // Should be checked (sibling of excluded)
      expect(
        isNodeSelected(tree, [
          "root",
          "Company Data",
          "Connected Data",
          "Notion",
          "Structured Chunking",
        ])
      ).toBe(true); // Should be checked (sibling of excluded)
      expect(
        isNodeSelected(tree, [
          "root",
          "Company Data",
          "Connected Data",
          "Notion",
          "Syncing",
        ])
      ).toBe(false); // Explicitly excluded

      // Other data sources should NOT be selected (different parents, not siblings)
      expect(
        isNodeSelected(tree, [
          "root",
          "Company Data",
          "Connected Data",
          "Google Drive",
        ])
      ).toBe(false); // Different data source
      expect(
        isNodeSelected(tree, [
          "root",
          "Company Data",
          "Connected Data",
          "Slack",
        ])
      ).toBe(false); // Different data source
      expect(
        isNodeSelected(tree, [
          "root",
          "Company Data",
          "Connected Data",
          "Microsoft",
        ])
      ).toBe(false); // Different data source
    });

    it("should handle multiple root level paths", () => {
      const tree = {
        in: [
          createTreeItem("root"),
          createTreeItem("docs"),
          createTreeItem("src"),
        ],
        notIn: [],
      };
      expect(isNodeSelected(tree, ["root"])).toBe(true);
      expect(isNodeSelected(tree, ["docs"])).toBe(true);
      expect(isNodeSelected(tree, ["src"])).toBe(true);
      expect(isNodeSelected(tree, ["other"])).toBe(false);
    });

  });
});
