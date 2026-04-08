import type { TSESTree } from "@typescript-eslint/types";

type ASTNode = TSESTree.Node | TSESTree.Program;

export type Visitor = (node: ASTNode) => void;

/**
 * Depth-first AST traversal. Calls visitor for every non-null node.
 * Handles null/undefined children gracefully.
 */
export function traverseAST(root: ASTNode, visitor: Visitor): void {
  traverse(root, visitor);
}

function traverse(node: unknown, visitor: Visitor): void {
  if (!node || typeof node !== "object") return;

  // Only visit actual AST nodes (they have a `type` string)
  const n = node as Record<string, unknown>;
  if (typeof n["type"] === "string") {
    visitor(n as unknown as ASTNode);
  }

  // Recurse into all values that could be nodes or arrays of nodes
  for (const key of Object.keys(n)) {
    if (key === "parent") continue; // avoid circular references
    const val = n[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        traverse(item, visitor);
      }
    } else if (val && typeof val === "object" && typeof (val as Record<string, unknown>)["type"] === "string") {
      traverse(val, visitor);
    }
  }
}
